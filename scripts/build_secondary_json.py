"""Build 2024–25 middle and high school maps from official NCES files.

The NCES CCD directory supplies schools and grades offered; EDGE geocodes
provide coordinates and counties; CCD membership supplies enrollment and
demographics. Downloaded archives can be reused with --source-dir.
"""

import argparse
import csv
import io
import json
import subprocess
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path


PUBLIC = Path(__file__).resolve().parents[1] / "public"
SOURCES = {
    "directory": ("ccd-directory.zip", "https://nces.ed.gov/ccd/data/zip/ccd_sch_029_2425_w_1a_073025.zip"),
    "geocodes": ("nces-locations.zip", "https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2425.zip"),
    "membership": ("ccd-membership.zip", "https://nces.ed.gov/ccd/data/zip/ccd_sch_052_2425_l_1a_073025.zip"),
}
REGIONS = {
    "nyc": {"Bronx": "36005", "Brooklyn": "36047", "Manhattan": "36061", "Queens": "36081", "Staten Island": "36085"},
    "westchester": {"Westchester": "36119"},
    "long-island": {"Nassau": "36059", "Suffolk": "36103"},
    "hudson-valley": {"Dutchess": "36027", "Orange": "36071", "Putnam": "36079", "Rockland": "36087", "Sullivan": "36105", "Ulster": "36111"},
    "new-jersey": {"Bergen, NJ": "34003", "Hudson, NJ": "34017", "Essex, NJ": "34013", "Union, NJ": "34039", "Passaic, NJ": "34031", "Middlesex, NJ": "34023"},
    "connecticut": {"Western Connecticut": "09190", "Greater Bridgeport": "09120"},
}
GRADES = {"middle": range(6, 9), "high": range(9, 13)}
ELEMENTARY_GRADE_FIELDS = ("G_PK_OFFERED", "G_KG_OFFERED", "G_1_OFFERED", "G_2_OFFERED", "G_3_OFFERED", "G_4_OFFERED")


def source_file(source_dir, key):
    filename, url = SOURCES[key]
    path = source_dir / filename
    if not path.exists():
        print(f"Downloading {filename}...", flush=True)
        request = urllib.request.Request(url, headers={"User-Agent": "schools-map-data-builder/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    return path


def zipped_csv(path, extension):
    archive = zipfile.ZipFile(path)
    name = next(name for name in archive.namelist() if name.lower().endswith(extension))
    return archive, io.TextIOWrapper(archive.open(name), encoding="utf-8-sig", newline="")


def geocodes(path, county_codes):
    archive, stream = zipped_csv(path, ".txt")
    try:
        rows = {}
        for row in csv.reader(stream, delimiter="|"):
            if len(row) >= 14 and row[9] in county_codes:
                try:
                    rows[row[0]] = {"countyCode": row[9], "lat": float(row[12]), "lng": float(row[13])}
                except ValueError:
                    pass
        return rows
    finally:
        stream.close()
        archive.close()


def directory(path, locations):
    archive, stream = zipped_csv(path, ".csv")
    try:
        rows = {}
        for row in csv.DictReader(stream):
            school_id = row["NCESSCH"]
            if school_id not in locations or row["SY_STATUS_TEXT"] not in {"Open", "New", "Changed Boundary/Agency"}:
                continue
            levels = [level for level, grades in GRADES.items()
                      if any(row.get(f"G_{grade}_OFFERED") == "Yes" for grade in grades)]
            if any(row.get(field) == "Yes" for field in ELEMENTARY_GRADE_FIELDS):
                levels.append("elementary")
            if levels:
                rows[school_id] = {"source": row, "levels": levels}
        return rows
    finally:
        stream.close()
        archive.close()


def membership(path, school_ids):
    filename = "ccd_sch_052_2425_l_1a_073025.csv"
    process = subprocess.Popen(["unzip", "-p", str(path), filename], stdout=subprocess.PIPE)
    assert process.stdout is not None
    stream = io.TextIOWrapper(process.stdout, encoding="utf-8-sig", newline="")
    try:
        print("Reading enrollment and demographics...", flush=True)
        # The 2.3 GB long file contains many rows per school. Only schoolwide
        # totals are used; the grade and race subtotals must not be added twice.
        totals = defaultdict(lambda: {"total": None, "races": defaultdict(list), "grades": {}})
        for line in stream:
            if not line.startswith(("2024-2025,09,", "2024-2025,34,", "2024-2025,36,")):
                continue
            row = next(csv.reader([line]))
            school_id = row[10]
            if school_id not in school_ids:
                continue
            count = int(row[15]) if row[15].isdigit() else None
            if row[16] == "Derived - Education Unit Total minus Adult Education Count":
                totals[school_id]["total"] = count
            elif row[16] == "Derived - Subtotal by Race/Ethnicity and Sex minus Adult Education Count" and row[14] != "No Category Codes":
                totals[school_id]["races"][row[13]].append(count)
            elif row[16] == "Subtotal 4 - By Grade" and count is not None:
                totals[school_id]["grades"][row[12]] = count
        race_names = {
            "asian": "Asian", "black": "Black or African American", "hispanic": "Hispanic/Latino",
            "white": "White", "multiracial": "Two or more races",
            "nativeAmerican": "American Indian or Alaska Native",
            "pacificIslander": "Native Hawaiian or Other Pacific Islander",
        }
        results = {}
        for school_id, item in totals.items():
            total = item["total"]
            demographics = {}
            for key, name in race_names.items():
                counts = item["races"].get(name, [])
                demographics[key] = round(100 * sum(counts) / total, 1) if total and counts and all(value is not None for value in counts) else None
            results[school_id] = {"enrollment": total, "demographics": demographics, "grades": item["grades"]}
        return results
    finally:
        stream.close()
        if process.wait() != 0:
            raise RuntimeError("Could not read the NCES membership archive")


def school_record(row, location, county, enrollment=None, demographics=None):
    return {
        "id": row["NCESSCH"], "name": row["SCH_NAME"].title(), "district": row["LEA_NAME"].title(),
        "schoolType": row["SCH_TYPE_TEXT"],
        "county": county, "city": row["LCITY"].title(), "address": (row.get("LSTREET1") or "").title(),
        "grades": f'{row["GSLO"]}-{row["GSHI"]}', "enrollment": enrollment,
        "lat": location["lat"], "lng": location["lng"], "ela": None, "math": None,
        "average": None, "demographics": demographics or {}, "reportUrl": None,
    }


def has_students(school_id, level, schools, enrollment):
    if level not in schools[school_id]["levels"]:
        return False
    counts = enrollment.get(school_id, {}).get("grades", {})
    if not counts:
        return True
    grades = ("Pre-Kindergarten", "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4") if level == "elementary" else tuple(f"Grade {grade}" for grade in GRADES[level])
    return any(counts.get(grade, 0) > 0 for grade in grades)


def extend_hudson_valley(schools, locations, enrollment):
    from build_metro_json import match_scores

    counties = {name: code for name, code in REGIONS["hudson-valley"].items()
                if name in {"Orange", "Rockland", "Sullivan"}}
    labels = {code: name for name, code in counties.items()}
    selected = [(school_id, item["source"]) for school_id, item in schools.items()
                if has_students(school_id, "elementary", schools, enrollment)
                and locations[school_id]["countyCode"] in labels]
    scores = match_scores([row for _, row in selected], counties)
    additions = []
    for school_id, row in selected:
        details = enrollment.get(school_id, {})
        record = school_record(row, locations[school_id], labels[locations[school_id]["countyCode"]],
                               details.get("enrollment"), details.get("demographics"))
        result = scores.get(school_id, {})
        record["ela"], record["math"], record["reportUrl"] = result.get("ela"), result.get("math"), result.get("url")
        ela, math = record["ela"], record["math"]
        if ela and math and ela["proficient"] is not None and math["proficient"] is not None:
            record["average"] = round((ela["proficient"] + math["proficient"]) / 2, 1)
        additions.append(record)
    path = PUBLIC / "hudson-valley-schools.json"
    existing = [school for school in json.loads(path.read_text()) if school["county"] not in counties]
    records = existing + additions
    records.sort(key=lambda school: (school["county"], school["district"], school["name"]))
    path.write_text(json.dumps(records, separators=(",", ":")) + "\n")
    print(f"elementary hudson-valley: {len(records)} schools, including {len(additions)} in Orange, Rockland, and Sullivan", flush=True)


def extend_hudson_valley_boundaries():
    from build_westchester_json import round_coordinates

    service = "https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Schools/MapServer/18/query"
    county_boxes = {"Orange": "-75.05,41.1,-73.85,42.05", "Rockland": "-74.35,40.95,-73.88,41.4", "Sullivan": "-75.2,41.4,-74.25,42.1"}
    names = {
        "CHESTER UFSD": "Chester Union Free School District",
        "CORNWALL CSD": "Cornwall Central School District",
        "FLORIDA UFSD": "Florida Union Free School District",
        "GOSHEN CSD": "Goshen Central School District",
        "GREENWOOD LAKE UFSD": "Greenwood Lake Union Free School District",
        "HIGHLAND FALLS CSD": "Highland Falls Central School District",
        "KIRYAS JOEL VILLAGE UFSD": "Kiryas Joel Village Union Free School District",
        "MIDDLETOWN CITY SD": "Middletown City School District",
        "MINISINK VALLEY CSD": "Minisink Valley Central School District",
        "MONROE-WOODBURY CSD": "Monroe-Woodbury Central School District",
        "NEWBURGH CITY SD": "Newburgh City School District",
        "PINE BUSH CSD": "Pine Bush Central School District",
        "PORT JERVIS CITY SD": "Port Jervis City School District",
        "TUXEDO UFSD": "Tuxedo Union Free School District",
        "VALLEY CSD (MONTGOMERY)": "Valley Central School District (Montgomery)",
        "WALLKILL CSD": "Wallkill Central School District",
        "WARWICK VALLEY CSD": "Warwick Valley Central School District",
        "WASHINGTONVILLE CSD": "Washingtonville Central School District",
        "CLARKSTOWN CSD": "Clarkstown Central School District",
        "EAST RAMAPO CSD (SPRING VALLEY)": "East Ramapo Central School District (Spring Valley)",
        "HAVERSTRAW-STONY POINT CSD (NORTH RO": "Haverstraw-Stony Point Csd (North Rockland)",
        "NANUET UFSD": "Nanuet Union Free School District",
        "NYACK UFSD": "Nyack Union Free School District",
        "PEARL RIVER UFSD": "Pearl River Union Free School District",
        "SOUTH ORANGETOWN CSD": "South Orangetown Central School District",
        "RAMAPO CSD (SUFFERN)": "Suffern Central School District",
        "ELDRED CSD": "Eldred Central School District",
        "FALLSBURG CSD": "Fallsburg Central School District",
        "LIBERTY CSD": "Liberty Central School District",
        "LIVINGSTON MANOR CSD": "Livingston Manor Central School District",
        "MONTICELLO CSD": "Monticello Central School District",
        "ROSCOE CSD": "Roscoe Central School District",
        "SULLIVAN WEST CSD": "Sullivan West Central School District",
        "TRI-VALLEY CSD": "Tri-Valley Central School District",
    }
    features, found, found_names = [], set(), set()
    for box in county_boxes.values():
        url = service + "?" + urllib.parse.urlencode({
            "where": "1=1", "geometry": box, "geometryType": "esriGeometryEnvelope",
            "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
            "outFields": "OBJECTID,POPULAR_NA", "outSR": 4326,
            "maxAllowableOffset": .001, "f": "geojson",
        })
        request = urllib.request.Request(url, headers={"User-Agent": "schools-map-data-builder/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)
        if "features" not in data:
            raise RuntimeError("New York district boundary response was incomplete")
        for feature in data["features"]:
            source_name = feature["properties"].get("POPULAR_NA")
            if source_name not in names:
                continue
            name = names[source_name]
            key = (name, json.dumps(feature["geometry"], sort_keys=True))
            if key in found:
                continue
            found.add(key)
            found_names.add(name)
            feature["properties"] = {"name": name}
            feature["geometry"]["coordinates"] = round_coordinates(feature["geometry"]["coordinates"])
            features.append(feature)
    if found_names != set(names.values()):
        raise RuntimeError("Missing Orange, Rockland, or Sullivan school district boundaries")
    path = PUBLIC / "hudson-valley-districts.geojson"
    existing = [feature for feature in json.loads(path.read_text())["features"]
                if feature["properties"].get("name") not in names.values()
                and feature["properties"].get("name") != "Haverstraw-Stony Point CSD (North Rockland)"]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": existing + features}, separators=(",", ":")) + "\n")
    print(f"hudson-valley districts: {len(existing) + len(features)} polygons", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("/tmp"), help="Directory for NCES source archives")
    parser.add_argument("--extend-hudson-valley", action="store_true", help="Add Orange, Rockland, and Sullivan elementary schools with NYSED scores")
    parser.add_argument("regions", nargs="*", help=f"Regions to build: {', '.join(REGIONS)}")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    selected = args.regions or list(REGIONS)
    if any(region not in REGIONS for region in selected):
        parser.error("Unknown region")
    county_codes = {code for region in selected for code in REGIONS[region].values()}
    locations = geocodes(source_file(args.source_dir, "geocodes"), county_codes)
    schools = directory(source_file(args.source_dir, "directory"), locations)
    enrollment = membership(source_file(args.source_dir, "membership"), schools)
    for region in selected:
        counties = REGIONS[region]
        labels = {code: name for name, code in counties.items()}
        for level in GRADES:
            records = [school_record(item["source"], locations[school_id], labels[locations[school_id]["countyCode"]],
                                     enrollment.get(school_id, {}).get("enrollment"), enrollment.get(school_id, {}).get("demographics"))
                       for school_id, item in schools.items()
                       if has_students(school_id, level, schools, enrollment) and locations[school_id]["countyCode"] in labels]
            records.sort(key=lambda school: (school["county"], school["district"], school["name"]))
            PUBLIC.joinpath(f"{level}-{region}-schools.json").write_text(json.dumps(records, separators=(",", ":")) + "\n")
            print(f"{level} {region}: {len(records)} schools", flush=True)
    if "nyc" in selected:
        from add_nyc_secondary_outcomes import enrich
        enrich(args.source_dir)
    if args.extend_hudson_valley:
        extend_hudson_valley(schools, locations, enrollment)
        extend_hudson_valley_boundaries()


if __name__ == "__main__":
    main()
