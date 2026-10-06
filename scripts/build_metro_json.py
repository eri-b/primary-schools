"""Build nearby elementary-school maps from official 2024–25 NCES data.

Long Island assessment results are matched to NYSED school report cards.
NJ proficiency comes from published NJSLA grade files. Connecticut's
performance index comes from the CSDE accountability dataset; it is a
different measure and must be labeled separately from proficiency.
"""

import concurrent.futures
import difflib
import io
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

from build_westchester_json import (
    NCES, NYSED, api_url, fetch, normalize, normalize_district,
    report_counts, round_coordinates, school_links,
)

PUBLIC = Path(__file__).resolve().parents[1] / "public"
DISTRICTS = "https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2425/MapServer/1/query"
REGIONS = {
    "long-island": {
        "Nassau": "36059", "Suffolk": "36103",
    },
    "hudson-valley": {
        "Dutchess": "36027", "Orange": "36071", "Putnam": "36079", "Rockland": "36087",
        "Sullivan": "36105", "Ulster": "36111",
    },
    "new-jersey": {
        "Bergen, NJ": "34003", "Hudson, NJ": "34017",
        "Essex, NJ": "34013", "Union, NJ": "34039",
        "Passaic, NJ": "34031", "Middlesex, NJ": "34023",
    },
    "connecticut": {
        "Western Connecticut": "09190", "Greater Bridgeport": "09120",
    },
}
NYSED_COUNTIES = {"Nassau": "28", "Suffolk": "58", "Dutchess": "13", "Orange": "44", "Putnam": "48", "Rockland": "50", "Sullivan": "59", "Ulster": "62"}
FIELDS = "NCESSCH,SCH_NAME,LEA_NAME,ST_LEAID,GSLO,GSHI,PK,KG,G01,G02,G03,G04,G05,TOTAL,LATCOD,LONCOD,LCITY,LSTREET1,SCHOOL_TYPE_TEXT,AM,AS,BL,HP,HI,TR,WH,CNTY"
NJ_REPORTS = "https://www.nj.gov/education/assessment/results/reports/2425/spring/"
CT_ACCOUNTABILITY = "https://data.ct.gov/resource/h28j-iix5.json"


def nysed_catalog(county_code):
    districts = school_links(fetch(api_url(NYSED + "profile.php", county=county_code)))
    # Only entries whose profile contains schools are useful. County profiles
    # also include colleges and other institutions with no school children.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        pages = list(pool.map(lambda item: (item, fetch(api_url(NYSED + "profile.php", instid=item[0]))), districts))
    schools = {}
    for district, page in pages:
        for instid, name in school_links(page):
            schools[instid] = {"name": name, "district": district[1]}
    return schools


def score_for(instid):
    url = api_url(NYSED + "essa.php", instid=instid, year=2025, createreport=1, **{"38ELA": 1, "38MATH": 1})
    page = fetch(url)
    return instid, {"ela": report_counts(page, "ela"), "math": report_counts(page, "math"), "url": url}


def match_scores(rows, counties):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        catalogs = list(pool.map(nysed_catalog, (NYSED_COUNTIES[county] for county in counties)))
    catalog = {key: value for part in catalogs for key, value in part.items()}
    by_name = {}
    for instid, item in catalog.items():
        by_name.setdefault(normalize(item["name"]), []).append(instid)
    matches, used = {}, set()
    for row in rows:
        key = normalize(row["SCH_NAME"])
        district_key = normalize_district(row["LEA_NAME"])
        candidates = [instid for instid, item in catalog.items()
                      if instid not in used and normalize_district(item["district"]) == district_key]
        choices = [instid for instid in by_name.get(key, []) if instid in candidates]
        if len(choices) != 1:
            exact = [instid for instid in by_name.get(key, []) if instid not in used]
            if len(exact) == 1:
                choices = exact
        if len(choices) != 1:
            ranked = sorted(((difflib.SequenceMatcher(None, key, normalize(catalog[instid]["name"])).ratio(), instid)
                             for instid in candidates), reverse=True)
            choices = [ranked[0][1]] if ranked and ranked[0][0] >= .75 and (len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= .08) else []
        if len(choices) == 1:
            matches[row["NCESSCH"]] = choices[0]
            used.add(choices[0])
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        scores = dict(pool.map(score_for, sorted(set(matches.values()))))
    return {school_id: scores[instid] for school_id, instid in matches.items()}


def fetch_binary(url):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "schools-map-data-builder/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except (TimeoutError, OSError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def xlsx_rows(data):
    """Read the first sheet of NJDOE's XLSX with the Python standard library."""
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        strings = ["".join(node.itertext()) for node in strings_root.findall(namespace + "si")]
        with archive.open("xl/worksheets/sheet1.xml") as sheet:
            for _, row in ET.iterparse(sheet, events=("end",)):
                if row.tag != namespace + "row":
                    continue
                values = [None] * 17
                for cell in row.findall(namespace + "c"):
                    column = "".join(char for char in cell.attrib["r"] if char.isalpha())
                    index = 0
                    for char in column:
                        index = index * 26 + ord(char) - 64
                    if not 1 <= index <= len(values):
                        continue
                    value = cell.find(namespace + "v")
                    if value is not None and value.text is not None:
                        values[index - 1] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
                yield values
                row.clear()


def nj_grade_scores(subject_grade):
    subject, grade = subject_grade
    filename = f"{subject}{grade:02d} NJSLA DATA 2024-25.xlsx"
    url = NJ_REPORTS + urllib.parse.quote(filename)
    results = {}
    for row in xlsx_rows(fetch_binary(url)):
        county, _, district, _, school_code, name, group, subgroup = row[:8]
        if county not in {"03", "13", "17", "23", "31", "39"} or not school_code or group != "Total" or subgroup != "All Students":
            continue
        valid, level4, level5 = row[10], row[15], row[16]
        try:
            result = (int(valid), float(level4) + float(level5))
        except (TypeError, ValueError):
            result = None
        results[(county + district, normalize(name))] = result
    return subject.lower(), grade, results


def match_nj_scores(rows):
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        grades = list(pool.map(nj_grade_scores, [(subject, grade) for subject in ("ELA", "MAT") for grade in (3, 4, 5)]))
    reports = defaultdict(lambda: defaultdict(dict))
    for subject, grade, results in grades:
        for key, result in results.items():
            reports[key][subject][grade] = result
    by_district = defaultdict(list)
    for key in reports:
        by_district[key[0]].append(key)
    matches = {}
    for row in rows:
        district = (row.get("ST_LEAID") or "").replace("NJ-", "")
        key = (district, normalize(row["SCH_NAME"]))
        if key not in reports:
            candidates = sorted(((difflib.SequenceMatcher(None, key[1], candidate[1]).ratio(), candidate)
                                 for candidate in by_district[district]), reverse=True)
            key = candidates[0][1] if candidates and candidates[0][0] >= .85 and (len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= .08) else None
        if key is None or key not in reports:
            continue
        result = {"url": "https://www.nj.gov/education/assessment/results/reports/2425/index.shtml"}
        for subject in ("ela", "mat"):
            entries = reports[key][subject]
            # Suppressed grade rows cannot be reconstructed from other cells.
            if not entries or any(item is None for item in entries.values()):
                result["math" if subject == "mat" else "ela"] = None
                continue
            tested = sum(item[0] for item in entries.values())
            result["math" if subject == "mat" else "ela"] = {
                "tested": tested,
                "proficient": round(sum(item[0] * item[1] for item in entries.values()) / tested, 1) if tested else None,
                "level4": None,
                "grades": [str(grade) for grade in sorted(entries)],
            }
        matches[row["NCESSCH"]] = result
    return matches


def match_ct_scores(rows):
    response = json.loads(fetch(api_url(CT_ACCOUNTABILITY, **{
        "$where": "schoolyear='2024-25'", "$select": "reportingdistrictcode,schoolname,schoolcode,ind1ela_all_rate,ind1math_all_rate",
        "$limit": 2000,
    })))
    if len(response) >= 2000:
        raise RuntimeError("Connecticut accountability response may be truncated")
    reports = {(item["reportingdistrictcode"], normalize(item["schoolname"])): item
               for item in response if item.get("schoolcode") != "0000000"}
    by_district = defaultdict(list)
    for key in reports:
        by_district[key[0]].append(key)
    matches = {}
    for row in rows:
        district = (row.get("ST_LEAID") or "").replace("CT-", "")
        key = (district, normalize(row["SCH_NAME"]))
        if key not in reports:
            candidates = sorted(((difflib.SequenceMatcher(None, key[1], candidate[1]).ratio(), candidate)
                                 for candidate in by_district[district]), reverse=True)
            key = candidates[0][1] if candidates and candidates[0][0] >= .85 and (len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= .08) else None
        if key is None or key not in reports:
            continue
        report = reports[key]
        result = {"url": "https://data.ct.gov/Education/Next-Generation-Accountability-System/h28j-iix5"}
        for subject, field in (("ela", "ind1ela_all_rate"), ("math", "ind1math_all_rate")):
            try:
                index = round(float(report[field]), 1)
            except (KeyError, TypeError, ValueError):
                index = None
            result[subject] = {"tested": None, "proficient": None, "index": index, "level4": None, "grades": []} if index is not None else None
        matches[row["NCESSCH"]] = result
    return matches


def school_rows(county_code):
    response = json.loads(fetch(api_url(NCES, where=f"CNTY='{county_code}'", outFields=FIELDS,
                                        returnGeometry="false", f="json", resultRecordCount=2000)))
    if response.get("error") or response.get("exceededTransferLimit"):
        raise RuntimeError(f"Incomplete NCES response for {county_code}: {response.get('error')}")
    return [feature["attributes"] for feature in response["features"]]


def school_record(row, county, result, region):
    ela, math = result.get("ela"), result.get("math")
    metric = "index" if region == "connecticut" else "proficient"
    average = round((ela[metric] + math[metric]) / 2, 1) if ela and math and ela[metric] is not None and math[metric] is not None else None
    total = row.get("TOTAL") if isinstance(row.get("TOTAL"), int) and row["TOTAL"] >= 0 else None
    demographics = {key: round(100 * row[column] / total, 1) if total and isinstance(row.get(column), int) and row[column] >= 0 else None
                    for key, column in (("asian", "AS"), ("black", "BL"), ("hispanic", "HI"), ("white", "WH"),
                                        ("multiracial", "TR"), ("nativeAmerican", "AM"), ("pacificIslander", "HP"))}
    return {
        "id": row["NCESSCH"], "name": row["SCH_NAME"].title(), "district": row["LEA_NAME"].title(),
        "county": county, "city": row["LCITY"].title(), "address": (row.get("LSTREET1") or "").title(),
        "grades": f'{row["GSLO"]}-{row["GSHI"]}', "enrollment": total,
        "lat": row["LATCOD"], "lng": row["LONCOD"], "ela": ela, "math": math,
        "average": average, "demographics": demographics, "reportUrl": result.get("url"),
    }


def district_boundaries(county_codes):
    features = {}
    for code in county_codes:
        response = json.loads(fetch(api_url(DISTRICTS, where=f"COID='{code}'", outFields="LEAID,LEA_NAME",
                                            outSR=4326, maxAllowableOffset=.001, f="geojson", resultRecordCount=2000)))
        if response.get("error") or response.get("exceededTransferLimit"):
            raise RuntimeError(f"Incomplete district boundaries for {code}: {response.get('error')}")
        for feature in response["features"]:
            district_id = feature["properties"]["LEAID"]
            feature["properties"] = {"name": feature["properties"]["LEA_NAME"]}
            feature["geometry"]["coordinates"] = round_coordinates(feature["geometry"]["coordinates"])
            features[district_id] = feature
    return {"type": "FeatureCollection", "features": list(features.values())}


def build_region(region, counties):
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        county_rows = dict(zip(counties, pool.map(school_rows, counties.values())))
    rows = [(county, row) for county, items in county_rows.items() for row in items
            if row["SCHOOL_TYPE_TEXT"] == "Regular School"
            and any((row.get(grade) or 0) > 0 for grade in ("PK", "KG", "G01", "G02", "G03", "G04"))
            and isinstance(row.get("LATCOD"), (int, float))
            and isinstance(row.get("LONCOD"), (int, float))]
    school_items = [row for _, row in rows]
    scores = match_scores(school_items, counties) if region in ("long-island", "hudson-valley") else match_nj_scores(school_items) if region == "new-jersey" else match_ct_scores(school_items)
    schools = [school_record(row, county, scores.get(row["NCESSCH"], {}), region) for county, row in rows]
    schools.sort(key=lambda item: (item["county"], item["district"], item["name"]))
    PUBLIC.joinpath(f"{region}-schools.json").write_text(json.dumps(schools, separators=(",", ":")) + "\n")
    boundaries = district_boundaries(counties.values())
    PUBLIC.joinpath(f"{region}-districts.geojson").write_text(json.dumps(boundaries, separators=(",", ":")) + "\n")
    print(f"{region}: {len(schools)} schools, {sum(s['average'] is not None for s in schools)} with scores, {len(boundaries['features'])} district polygons", flush=True)


if __name__ == "__main__":
    import sys
    selected = sys.argv[1:] or list(REGIONS)
    for name in selected:
        build_region(name, REGIONS[name])
