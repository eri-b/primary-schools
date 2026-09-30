"""Build the Westchester elementary map from NYSED, NCES, and county GIS.

NYSED's public 2024-25 school report cards supply grades 3-5 ELA and math
counts. NCES 2024-25 administrative data supplies school locations, grade
spans, enrollment, and demographics. County GIS supplies district polygons.
"""

import concurrent.futures
import difflib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
NYSED = "https://data.nysed.gov/"
NCES = "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1/query"
DISTRICTS = "https://q-giswww.westchestergov.com/arcgis/rest/services/MappingWestchesterCounty/MapServer/87/query"
HISTORIC_ZONES = "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/SABS_1516/MapServer/0/query"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "schools-map-data-builder/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode("utf-8", errors="replace")
        except (TimeoutError, OSError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def api_url(base, **params):
    return base + "?" + urllib.parse.urlencode(params)


def normalize(name):
    name = html.unescape(name).upper().replace("&", " AND ")
    name = re.sub(r"\bMT\b", "MOUNT", name)
    name = re.sub(r"\b(ELEMENTARY|ELEM|SCHOOL|SCH|THE)\b", "", name)
    return re.sub(r"[^A-Z0-9]", "", name)


def normalize_district(name):
    name = html.unescape(name).upper()
    if "CHARTER" in name and "EXCELLENCE" in name:
        return "CHARTEREDUCATIONALEXCELLENCE"
    name = re.sub(r"\bMT\b", "MOUNT", name)
    name = re.sub(r"\b(CENTRAL|UNION|FREE|CITY|SCHOOL|DISTRICT|CSD|UFSD|OF|THE)\b", "", name)
    return re.sub(r"[^A-Z0-9]", "", name)


def round_coordinates(coordinates):
    if isinstance(coordinates[0], (int, float)):
        return [round(value, 5) for value in coordinates]
    return [round_coordinates(child) for child in coordinates]


def school_links(page):
    return [(match.group(1), html.unescape(re.sub(r"<[^>]+>", "", match.group(2))).strip())
            for match in re.finditer(r'<li class="bullet-item"><a href="profile\.php\?instid=(\d+)">([^<]+)</a>', page)]


def report_counts(page, subject):
    heading = "English Language Arts" if subject == "ela" else "Mathematics"
    match = re.search(r"Grades 3-8 " + heading + r" Results.*?<tbody>(.*?)</tbody>", page, re.S)
    if not match:
        return None
    rows = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", match.group(1), re.S):
        values = {key: html.unescape(re.sub(r"<[^>]+>", "", value)).strip()
                  for key, value in re.findall(r'<td data-label="([^"]+)">([^<]*)</td>', row)}
        if values.get("GRADE") in {"Grade 3", "Grade 4", "Grade 5"}:
            rows.append(values)
    if not rows:
        return None

    def number(value):
        return int(value.replace(",", "")) if value and value.replace(",", "").isdigit() else None

    tested = sum(number(row.get("TESTED")) or 0 for row in rows)
    # NYSED suppresses small groups. Never derive a protected number from
    # another cell; publish an aggregate only when every grade is public.
    proficient = [number(row.get("PROF_COUNT")) for row in rows]
    level4 = [number(row.get("LEVEL_4_COUNT")) for row in rows]
    return {
        "tested": tested,
        "proficient": round(100 * sum(proficient) / tested, 1) if tested and all(v is not None for v in proficient) else None,
        "level4": round(100 * sum(level4) / tested, 1) if tested and all(v is not None for v in level4) else None,
        "grades": [row["GRADE"].replace("Grade ", "") for row in rows],
    }


def score_for(item):
    instid, name = item
    url = api_url(NYSED + "essa.php", instid=instid, year=2025, createreport=1, **{"38ELA": 1, "38MATH": 1})
    page = fetch(url)
    return instid, {"ela": report_counts(page, "ela"), "math": report_counts(page, "math"), "url": url}


def main():
    county = fetch(NYSED + "profile.php?county=66")
    districts = school_links(county)
    # County profile lists public districts first, followed by charter LEAs
    # and colleges. The charter LEAs are included where they list a school.
    district_ids = districts[:next(index for index, entry in enumerate(districts)
                                   if entry[1] == "ACADEMY FOR JEWISH RELIGION")]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(lambda item: (item, fetch(api_url(NYSED + "profile.php", instid=item[0]))), district_ids))
    nysed_schools = {}
    for district, page in pages:
        links = school_links(page)
        if not links and district[1] == "CHARTER SCH-EDUC EXCELLENCE":
            links = [(district[0], "CHARTER SCHOOL OF EDUCATIONAL EXCELLENCE")]
        for instid, name in links:
            nysed_schools[instid] = {"name": name, "district": district[1]}

    fields = "NCESSCH,SCH_NAME,LEA_NAME,GSLO,GSHI,PK,KG,G01,G02,G03,G04,G05,TOTAL,LATCOD,LONCOD,LCITY,LSTREET1,SCHOOL_TYPE_TEXT,AM,AS,BL,HP,HI,TR,WH"
    response = json.loads(fetch(api_url(NCES, where="CNTY='36119'", outFields=fields,
                                        returnGeometry="false", f="json", resultRecordCount=1000)))
    if response.get("error"):
        raise RuntimeError(response["error"])
    school_rows = [feature["attributes"] for feature in response["features"]]
    # A school must serve an elementary grade below fifth. Excludes middle
    # schools whose only elementary grade is fifth, and nonregular facilities.
    school_rows = [row for row in school_rows
                   if row["SCHOOL_TYPE_TEXT"] == "Regular School"
                   # NCES erroneously codes this Saratoga County school as
                   # Westchester and geocodes it near Harrison, NY.
                   and row["LEA_NAME"] != "SOUTH GLENS FALLS CENTRAL SCHOOL DISTRICT"
                   and any((row.get(grade) or 0) > 0 for grade in ("PK", "KG", "G01", "G02", "G03", "G04"))
                   and isinstance(row.get("LATCOD"), (int, float))]

    by_name = {}
    for instid, item in nysed_schools.items():
        by_name.setdefault(normalize(item["name"]), []).append(instid)
    matches = {}
    used = set()
    unmatched = []
    for row in school_rows:
        key = normalize(row["SCH_NAME"])
        district_key = normalize_district(row["LEA_NAME"])
        district_candidates = [instid for instid, item in nysed_schools.items()
                               if instid not in used and normalize_district(item["district"]) == district_key]
        choices = [candidate for candidate in by_name.get(key, []) if candidate in district_candidates]
        if len(choices) != 1:
            # A few district names differ across NYSED and NCES releases.
            # A globally unique, exact school name remains safe to join.
            unique_exact = [candidate for candidate in by_name.get(key, []) if candidate not in used]
            if len(unique_exact) == 1:
                choices = unique_exact
        if len(choices) != 1:
            ranked = sorted(((difflib.SequenceMatcher(None, key, normalize(item["name"])).ratio(), instid)
                             for instid, item in nysed_schools.items() if instid in district_candidates), reverse=True)
            choices = [ranked[0][1]] if ranked and ranked[0][0] >= 0.75 and (len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= 0.08) else []
        if choices:
            matches[row["NCESSCH"]] = choices[0]
            used.add(choices[0])
        else:
            unmatched.append(row["SCH_NAME"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = dict(pool.map(score_for, [(instid, nysed_schools[instid]["name"]) for instid in matches.values()]))

    schools = []
    for row in school_rows:
        ncessch = row["NCESSCH"]
        instid = matches.get(ncessch)
        result = results.get(instid, {})
        ela, math = result.get("ela"), result.get("math")
        average = round((ela["proficient"] + math["proficient"]) / 2, 1) if ela and math and ela["proficient"] is not None and math["proficient"] is not None else None
        total = row.get("TOTAL") if isinstance(row.get("TOTAL"), int) and row["TOTAL"] >= 0 else None
        demographics = {key: round(100 * row[column] / total, 1) if total and isinstance(row.get(column), int) and row[column] >= 0 else None
                        for key, column in (("asian", "AS"), ("black", "BL"), ("hispanic", "HI"), ("white", "WH"),
                                            ("multiracial", "TR"), ("nativeAmerican", "AM"), ("pacificIslander", "HP"))}
        schools.append({
            "id": ncessch, "name": row["SCH_NAME"].title(), "district": row["LEA_NAME"].title(),
            "city": row["LCITY"].title(), "address": row["LSTREET1"].title(),
            "grades": f'{row["GSLO"]}-{row["GSHI"]}', "enrollment": total,
            "lat": row["LATCOD"], "lng": row["LONCOD"],
            "ela": ela, "math": math, "average": average, "demographics": demographics,
            "reportUrl": result.get("url"),
        })
    schools.sort(key=lambda school: (school["district"], school["name"]))
    PUBLIC.joinpath("westchester-schools.json").write_text(json.dumps(schools, separators=(",", ":")) + "\n")

    boundaries = json.loads(fetch(api_url(DISTRICTS, where="1=1", outFields="DISTNAME", outSR=4326, f="geojson")))
    for feature in boundaries["features"]:
        feature["properties"] = {"name": feature["properties"]["DISTNAME"]}
        feature["geometry"]["coordinates"] = round_coordinates(feature["geometry"]["coordinates"])
    PUBLIC.joinpath("westchester-districts.geojson").write_text(json.dumps(boundaries, separators=(",", ":")) + "\n")

    # SABS is the only nationwide school-level boundary source we found.
    # Its 2015-16 polygons are deliberately a separate, default-off layer.
    zone_index = json.loads(fetch(api_url(
        HISTORIC_ZONES, where="stAbbrev='NY'", geometry="-74.12,40.87,-73.45,41.39",
        geometryType="esriGeometryEnvelope", inSR=4326, spatialRel="esriSpatialRelIntersects",
        outFields="OBJECTID,ncessch,level", returnGeometry="false", f="json", resultRecordCount=1000,
    )))
    current_ids = {school["id"] for school in schools}
    zone_ids = [feature["attributes"]["OBJECTID"] for feature in zone_index["features"]
                if feature["attributes"]["ncessch"] in current_ids
                and feature["attributes"]["level"] in {"1", "4"}]
    zones = {"type": "FeatureCollection", "features": []}
    for start in range(0, len(zone_ids), 25):
        batch = json.loads(fetch(api_url(HISTORIC_ZONES, objectIds=",".join(map(str, zone_ids[start:start + 25])),
                                       outFields="schnam,ncessch", outSR=4326, f="geojson")))
        for feature in batch["features"]:
            feature["properties"] = {"name": feature["properties"]["schnam"], "schoolId": feature["properties"]["ncessch"]}
            feature["geometry"]["coordinates"] = round_coordinates(feature["geometry"]["coordinates"])
            zones["features"].append(feature)
    PUBLIC.joinpath("westchester-zones-2015.geojson").write_text(json.dumps(zones, separators=(",", ":")) + "\n")
    print(f"Wrote {len(schools)} schools, {sum(s['average'] is not None for s in schools)} with scores, {len(boundaries['features'])} district polygons")
    print(f"Wrote {len(zones['features'])} historical attendance polygons (2015–16)")
    print(f"Unmatched NYSED reports ({len(unmatched)}): {', '.join(unmatched)}")


if __name__ == "__main__":
    main()
