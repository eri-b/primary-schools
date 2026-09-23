import argparse
import json
import subprocess
import tempfile
import urllib.parse
import zipfile
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "public" / "schools.json"

DEMOGRAPHICS_URL = (
    "https://infohub.nyced.org/docs/default-source/default-document-library/"
    "demographic-snapshot-2021-22-to-2025-26-public.xlsx"
)
ELA_URL = (
    "https://infohub.nyced.org/docs/default-source/default-document-library/"
    "school-ela-results-public.xlsx"
)
MATH_URL = (
    "https://infohub.nyced.org/docs/default-source/default-document-library/"
    "school-math-results-public.xlsx"
)
LOCATIONS_URL = (
    "https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/"
    "NYC_School_Point_Locations/FeatureServer/0/query"
)
GIFTED_TALENTED_URL = "https://www.myschools.nyc/en/api/v2/schools/process/8/"
KINDERGARTEN_URL = "https://www.myschools.nyc/en/api/v2/schools/process/4/"
CAPACITY_URL = "https://data.cityofnewyork.us/resource/gkd7-3vk7.json"

SOURCE_FILENAMES = {
    "demographics": "demographics.xlsx",
    "ela": "ela.xlsx",
    "math": "math.xlsx",
    "locations": "locations.json",
    "gifted_talented": "gifted_talented.json",
    "kindergarten": "kindergarten.json",
    "capacity": "capacity.json",
}

# This new school is in the 2025-26 NYCPS data but not yet in the April 2026
# NYC Open Data point layer. Coordinates are for its official location at
# 188 Rochester Avenue, Brooklyn.
LOCATION_OVERRIDES = {
    "17K969": {"lat": 40.67271, "lng": -73.928917},
}

BOROUGHS = {
    "M": "Manhattan",
    "X": "Bronx",
    "K": "Brooklyn",
    "Q": "Queens",
    "R": "Staten Island",
}

XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PACKAGE_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def download(url, destination, query=None):
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    script = """
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
const [url, destination] = process.argv.slice(1);
const response = await fetch(url, { headers: { 'User-Agent': 'primary-schools-data-builder/1.0' } });
if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script, url, str(destination)],
        check=True,
    )


def download_paginated_json(url, destination):
    script = """
import { writeFile } from 'node:fs/promises';
const [initialUrl, destination] = process.argv.slice(1);
const results = [];
let url = initialUrl;
while (url) {
  const response = await fetch(url.replace(/^http:/, 'https:'), {
    headers: { 'User-Agent': 'primary-schools-data-builder/1.0' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const page = await response.json();
  results.push(...page.results);
  url = page.next;
}
await writeFile(destination, JSON.stringify({ results }));
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script, url, str(destination)],
        check=True,
    )


def download_sources(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for key, url in (("demographics", DEMOGRAPHICS_URL), ("ela", ELA_URL), ("math", MATH_URL)):
        print(f"Downloading {key} data from NYCPS...")
        download(url, directory / SOURCE_FILENAMES[key])

    print("Downloading school locations from NYC Open Data...")
    download(
        LOCATIONS_URL,
        directory / SOURCE_FILENAMES["locations"],
        {
            "f": "json",
            "where": "1=1",
            "outFields": "ATS,Name,Geographic,Latitude,Longitude",
            "returnGeometry": "false",
            "resultRecordCount": 2000,
        },
    )

    print("Downloading Gifted & Talented programs from MySchools...")
    download_paginated_json(
        GIFTED_TALENTED_URL,
        directory / SOURCE_FILENAMES["gifted_talented"],
    )
    print("Downloading kindergarten admissions data from MySchools...")
    download_paginated_json(
        KINDERGARTEN_URL,
        directory / SOURCE_FILENAMES["kindergarten"],
    )
    print("Downloading the latest capacity report from NYC Open Data...")
    script = """
import { writeFile } from 'node:fs/promises';
const [base, destination] = process.argv.slice(1);
const latest = await (await fetch(`${base}?$select=max(data_as_of)%20as%20date`)).json();
const date = latest[0].date;
const url = `${base}?${new URLSearchParams({$where: `data_as_of='${date}'`, $limit: '10000'})}`;
const response = await fetch(url);
if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
await writeFile(destination, JSON.stringify(await response.json()));
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script, CAPACITY_URL,
         str(directory / SOURCE_FILENAMES["capacity"])],
        check=True,
    )


def shared_strings(archive):
    try:
        source = archive.open("xl/sharedStrings.xml")
    except KeyError:
        return []

    values = []
    with source:
        for _, element in ElementTree.iterparse(source, events=("end",)):
            if element.tag == f"{XML_NS}si":
                values.append("".join(node.text or "" for node in element.iter(f"{XML_NS}t")))
                element.clear()
    return values


def sheet_path(archive, sheet_name):
    workbook = ElementTree.parse(archive.open("xl/workbook.xml"))
    relationship_id = None
    for sheet in workbook.iterfind(f".//{XML_NS}sheet"):
        if sheet.attrib["name"] == sheet_name:
            relationship_id = sheet.attrib[f"{REL_NS}id"]
            break
    if relationship_id is None:
        raise ValueError(f"Sheet {sheet_name!r} not found")

    relationships = ElementTree.parse(archive.open("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.iterfind(f".//{PACKAGE_REL_NS}Relationship"):
        if relationship.attrib["Id"] == relationship_id:
            target = relationship.attrib["Target"].lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError(f"Relationship for sheet {sheet_name!r} not found")


def column_index(reference):
    letters = "".join(character for character in reference if character.isalpha())
    result = 0
    for character in letters:
        result = result * 26 + ord(character.upper()) - ord("A") + 1
    return result - 1


def cell_value(cell, strings):
    value_node = cell.find(f"{XML_NS}v")
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{XML_NS}t"))
    if value_node is None or value_node.text is None:
        return None
    value = value_node.text
    if cell_type == "s":
        return strings[int(value)]
    if cell_type in {"str", "e"}:
        return value
    if cell_type == "b":
        return value == "1"
    number = float(value)
    return int(number) if number.is_integer() else number


def xlsx_rows(path, sheet_name):
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        worksheet_path = sheet_path(archive, sheet_name)
        with archive.open(worksheet_path) as source:
            for _, row in ElementTree.iterparse(source, events=("end",)):
                if row.tag != f"{XML_NS}row":
                    continue
                cells = {}
                for cell in row.findall(f"{XML_NS}c"):
                    cells[column_index(cell.attrib["r"])] = cell_value(cell, strings)
                if cells:
                    yield [cells.get(index) for index in range(max(cells) + 1)]
                row.clear()


def keyed_rows(path, sheet_name, predicate):
    rows = xlsx_rows(path, sheet_name)
    headers = next(rows)
    result = {}
    for values in rows:
        row = dict(zip(headers, values))
        if predicate(row):
            result[row["DBN"]] = row
    return result


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def rounded(value, scale=1):
    return round(value * scale, 1) if is_number(value) else None


def threshold(value):
    if is_number(value):
        return round(value * 100, 1)
    return {"Above 95%": ">95%", "Below 5%": "<5%"}.get(value, value)


def count(value):
    return value if is_number(value) else None


def share(count_value, percent_value):
    return {
        "count": count(count_value),
        "percent": rounded(percent_value, 100),
    }


def test_levels(row):
    return [
        {
            "level": level,
            "count": count(row[f"# Level {level}"]),
            "percent": rounded(row[f"% Level {level}"]),
        }
        for level in range(1, 5)
    ]


def grade_span(row):
    grades = [
        ("3K", "Grade 3K"),
        ("PK", "Grade PK (Half Day & Full Day)"),
        ("K", "Grade K"),
        *[(str(grade), f"Grade {grade}") for grade in range(1, 13)],
    ]
    offered = [label for label, column in grades if (row.get(column) or 0) > 0]
    return offered[0] if len(offered) == 1 else f"{offered[0]}-{offered[-1]}"


def has_elementary_tested_grade(row):
    return any((row.get(f"Grade {grade}") or 0) > 0 for grade in (3, 4, 5))


def percentile_ranks(rows, column):
    published = sorted(
        (row[column], dbn)
        for dbn, row in rows.items()
        if is_number(row[column])
    )
    positions = {}
    index = 0
    while index < len(published):
        end = index
        while end + 1 < len(published) and published[end + 1][0] == published[index][0]:
            end += 1
        percentile = 100 * (((index + end) / 2) + 1) / len(published)
        for _, dbn in published[index : end + 1]:
            positions[dbn] = percentile
        index = end + 1
    return positions


def load_locations(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("error"):
        raise ValueError(f"Location API error: {payload['error']}")
    locations = {}
    for feature in payload["features"]:
        attributes = feature["attributes"]
        if attributes.get("ATS") and is_number(attributes.get("Latitude")) and is_number(attributes.get("Longitude")):
            locations[attributes["ATS"]] = {
                "lat": attributes["Latitude"],
                "lng": attributes["Longitude"],
            }
    return {**locations, **LOCATION_OVERRIDES}


def load_gifted_talented(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    programs_by_dbn = {}
    for directory_school in payload["results"]:
        dbn = directory_school["school"]["dbn"]
        programs = directory_school["programs"]
        if len(programs) != 1:
            raise ValueError(f"Expected one G&T program for {dbn}, found {len(programs)}")
        program = programs[0]
        program_type = program["admissions_method"]["name"]
        if program_type not in {"District G&T", "Citywide G&T"}:
            raise ValueError(f"Unexpected G&T program type for {dbn}: {program_type}")
        programs_by_dbn[dbn] = {
            "type": program_type,
            "programCode": program["program"]["code"],
            "directoryId": directory_school["id"],
        }
    return programs_by_dbn


def load_capacity(path):
    rows = json.loads(path.read_text(encoding="utf-8"))
    by_organization = {}
    for row in rows:
        organization = row.get("org_id")
        if not organization or not organization[1:].isdigit():
            continue
        by_organization.setdefault(organization, []).append(row)

    capacity = {}
    for organization, sites in by_organization.items():
        try:
            enrollment = sum(int(site["org_enroll"]) for site in sites)
            seats = sum(int(site["org_target_cap"]) for site in sites)
        except (KeyError, TypeError, ValueError):
            continue
        if seats <= 0:
            continue
        capacity[organization] = {
            "enrollment": enrollment,
            "seats": seats,
            "utilization": round(100 * enrollment / seats),
            "sites": len(sites),
            "reportDate": max(site["data_as_of"][:10] for site in sites),
        }
    return capacity


def load_kindergarten(path):
    directory = json.loads(path.read_text(encoding="utf-8"))
    admissions = {}
    for school in directory["results"]:
        programs = []
        for program in school["programs"]:
            demand = program.get("demand_last_year") or {}
            general = demand.get("general_education") or {}
            programs.append({
                "name": program["name"],
                "code": program["program"]["code"],
                "method": program["admissions_method"]["name"],
                "seatsLastYear": general.get("seats"),
                "applicantsLastYear": general.get("applicants"),
                "filledLastYear": general.get("all_seats_filled"),
                "priorities": [
                    {
                        "name": group["name"],
                        "result": group.get("ge_priority_group_description") or "",
                    }
                    for group in program.get("program_priority_groups", [])
                ],
            })
        admissions[school["school"]["dbn"]] = {
            "directoryId": school["id"],
            "directoryYear": school["school"].get("school_year", ""),
            "programs": programs,
        }
    return admissions


def build(source_dir):
    demographics = keyed_rows(
        source_dir / SOURCE_FILENAMES["demographics"],
        "School",
        lambda row: row["Year"] == "2025-26",
    )
    ela = keyed_rows(
        source_dir / SOURCE_FILENAMES["ela"],
        "ELA - All",
        lambda row: row["Year"] == 2026 and row["Grade"] == "All Grades",
    )
    math_rows = keyed_rows(
        source_dir / SOURCE_FILENAMES["math"],
        "Math - All",
        lambda row: row["Year"] == 2026 and row["Grade"] == "All Grades",
    )
    locations = load_locations(source_dir / SOURCE_FILENAMES["locations"])
    gifted_talented = load_gifted_talented(
        source_dir / SOURCE_FILENAMES["gifted_talented"]
    )
    capacity = load_capacity(source_dir / SOURCE_FILENAMES["capacity"])
    kindergarten = load_kindergarten(source_dir / SOURCE_FILENAMES["kindergarten"])

    dbns = sorted(
        dbn
        for dbn, row in demographics.items()
        if int(dbn[:2]) <= 32
        and has_elementary_tested_grade(row)
        and dbn in ela
        and dbn in math_rows
    )
    percentile_dbns = [
        dbn
        for dbn in dbns
        if is_number(ela[dbn]["% Level 3+4"])
        and is_number(math_rows[dbn]["% Level 3+4"])
    ]
    selected_ela = {dbn: ela[dbn] for dbn in percentile_dbns}
    selected_math = {dbn: math_rows[dbn] for dbn in percentile_dbns}
    ela_percentiles = percentile_ranks(selected_ela, "% Level 3+4")
    math_percentiles = percentile_ranks(selected_math, "% Level 3+4")

    missing_locations = sorted(set(dbns) - set(locations))
    if missing_locations:
        raise ValueError(f"Missing locations for: {', '.join(missing_locations)}")

    schools = []
    for dbn in dbns:
        demographic = demographics[dbn]
        ela_row = ela[dbn]
        math_row = math_rows[dbn]
        ela_proficient = rounded(ela_row["% Level 3+4"])
        math_proficient = rounded(math_row["% Level 3+4"])
        average = (
            round((ela_row["% Level 3+4"] + math_row["% Level 3+4"]) / 2, 1)
            if is_number(ela_row["% Level 3+4"])
            and is_number(math_row["% Level 3+4"])
            else None
        )
        average_percentile = (
            round((ela_percentiles[dbn] + math_percentiles[dbn]) / 2, 1)
            if dbn in ela_percentiles and dbn in math_percentiles
            else None
        )
        schools.append(
            {
                **locations[dbn],
                "dbn": dbn,
                "name": demographic["School Name"],
                "borough": BOROUGHS[dbn[2]],
                "district": int(dbn[:2]),
                "grades": grade_span(demographic),
                "enrollment": demographic["Total Enrollment"],
                "elaTested": ela_row["Number Tested"],
                "elaMeanScore": rounded(ela_row["Mean Scale Score"]),
                "ela": ela_proficient,
                "elaLevel4": rounded(ela_row["% Level 4"]),
                "elaPctile": rounded(ela_percentiles.get(dbn)),
                "mathTested": math_row["Number Tested"],
                "mathMeanScore": rounded(math_row["Mean Scale Score"]),
                "math": math_proficient,
                "mathLevel4": rounded(math_row["% Level 4"]),
                "mathPctile": rounded(math_percentiles.get(dbn)),
                "average": average,
                "averagePctile": average_percentile,
                "asian": rounded(demographic["% Asian and Pacific Islander"], 100),
                "black": rounded(demographic["% Black"], 100),
                "hispanic": rounded(demographic["% Hispanic"], 100),
                "white": rounded(demographic["% White"], 100),
                "multiracial": rounded(demographic["% Multi-Racial"], 100),
                "nativeAmerican": rounded(demographic["% Native American"], 100),
                "swd": rounded(demographic["% Students with Disabilities"], 100),
                "ell": rounded(demographic["% English Language Learners"], 100),
                "poverty": threshold(demographic["% Poverty"]),
                "eni": threshold(demographic["Economic Need Index"]),
                "giftedTalented": gifted_talented.get(dbn),
                "capacity": capacity.get(dbn[2:]),
                "kindergarten": kindergarten.get(dbn),
                "details": {
                    "gradeEnrollment": [
                        {"grade": label, "count": demographic[column] or 0}
                        for label, column in [
                            ("3K", "Grade 3K"),
                            ("PK", "Grade PK (Half Day & Full Day)"),
                            ("K", "Grade K"),
                            *[(str(grade), f"Grade {grade}") for grade in range(1, 13)],
                        ]
                        if (demographic[column] or 0) > 0
                    ],
                    "gender": [
                        {
                            "label": "Female",
                            **share(demographic["# Female"], demographic["% Female"]),
                        },
                        {
                            "label": "Male",
                            **share(demographic["# Male"], demographic["% Male"]),
                        },
                        {
                            "label": "Neither female nor male",
                            **share(
                                demographic["# Neither Female nor Male"],
                                demographic["% Neither Female nor Male"],
                            ),
                        },
                    ],
                    "race": [
                        {
                            "label": label,
                            **share(demographic[count_column], demographic[percent_column]),
                        }
                        for label, count_column, percent_column in [
                            (
                                "Asian and Pacific Islander",
                                "# Asian and Pacific Islander",
                                "% Asian and Pacific Islander",
                            ),
                            ("Black", "# Black", "% Black"),
                            ("Hispanic", "# Hispanic", "% Hispanic"),
                            ("White", "# White", "% White"),
                            ("Multi-Racial", "# Multi-Racial", "% Multi-Racial"),
                            ("Native American", "# Native American", "% Native American"),
                            (
                                "Missing race/ethnicity",
                                "# Missing Race/Ethnicity Data",
                                "% Missing Race/Ethnicity Data",
                            ),
                        ]
                    ],
                    "programs": [
                        {
                            "label": "Students with disabilities",
                            **share(
                                demographic["# Students with Disabilities"],
                                demographic["% Students with Disabilities"],
                            ),
                        },
                        {
                            "label": "English language learners",
                            **share(
                                demographic["# English Language Learners"],
                                demographic["% English Language Learners"],
                            ),
                        },
                        {
                            "label": "Students in poverty",
                            "count": count(demographic["# Poverty"]),
                            "percent": threshold(demographic["% Poverty"]),
                        },
                    ],
                    "elaLevels": test_levels(ela_row),
                    "mathLevels": test_levels(math_row),
                },
            }
        )

    if len(schools) != 791:
        raise ValueError(f"Expected 791 schools from the current source releases, found {len(schools)}")
    if not any(school["dbn"] == "13K270" for school in schools):
        raise ValueError("P.S. 270 Johann DeKalb is missing from the generated data")
    return schools


def parse_args():
    parser = argparse.ArgumentParser(description="Build schools.json from official NYCPS source files")
    parser.add_argument(
        "--source-dir",
        type=Path,
        help=(
            "Use local demographics.xlsx, ela.xlsx, math.xlsx, locations.json, "
            "gifted_talented.json, kindergarten.json, and capacity.json files"
        ),
    )
    parser.add_argument("--output", type=Path, default=JSON_PATH)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.source_dir:
        schools = build(args.source_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="primary-schools-") as temporary:
            source_dir = Path(temporary)
            download_sources(source_dir)
            schools = build(source_dir)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as destination:
        json.dump(schools, destination, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        destination.write("\n")
    suppressed = sum(school["average"] is None for school in schools)
    print(f"Wrote {len(schools)} schools to {args.output} ({suppressed} with suppressed aggregate results)")


if __name__ == "__main__":
    main()
