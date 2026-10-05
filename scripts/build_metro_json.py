"""Build nearby elementary-school maps from official 2024–25 NCES data.

Long Island assessment results are matched to NYSED school report cards.
NJ and CT assessment fields remain unavailable rather than mixing unlike tests.
"""

import concurrent.futures
import difflib
import json
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
    "neighbors": {
        "Bergen, NJ": "34003", "Hudson, NJ": "34017",
        "Essex, NJ": "34013", "Union, NJ": "34039",
        "Passaic, NJ": "34031", "Middlesex, NJ": "34023",
        "Western Connecticut": "09190", "Greater Bridgeport": "09120",
    },
}
NYSED_COUNTIES = {"Nassau": "28", "Suffolk": "58"}
FIELDS = "NCESSCH,SCH_NAME,LEA_NAME,GSLO,GSHI,PK,KG,G01,G02,G03,G04,G05,TOTAL,LATCOD,LONCOD,LCITY,LSTREET1,SCHOOL_TYPE_TEXT,AM,AS,BL,HP,HI,TR,WH,CNTY"


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


def match_scores(rows):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        catalogs = list(pool.map(nysed_catalog, NYSED_COUNTIES.values()))
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


def school_rows(county_code):
    response = json.loads(fetch(api_url(NCES, where=f"CNTY='{county_code}'", outFields=FIELDS,
                                        returnGeometry="false", f="json", resultRecordCount=2000)))
    if response.get("error") or response.get("exceededTransferLimit"):
        raise RuntimeError(f"Incomplete NCES response for {county_code}: {response.get('error')}")
    return [feature["attributes"] for feature in response["features"]]


def school_record(row, county, result):
    ela, math = result.get("ela"), result.get("math")
    average = round((ela["proficient"] + math["proficient"]) / 2, 1) if ela and math and ela["proficient"] is not None and math["proficient"] is not None else None
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
    scores = match_scores([row for _, row in rows]) if region == "long-island" else {}
    schools = [school_record(row, county, scores.get(row["NCESSCH"], {})) for county, row in rows]
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
