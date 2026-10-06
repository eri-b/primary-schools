"""Add published NYCPS middle-school assessments and high-school graduation outcomes.

School locations and enrollment come from 2024–25 NCES files; NYCPS outcomes
are from 2026 grades 6–8 tests and the 2021 four-year cohort (class of 2025).
"""

import argparse
import csv
import io
import json
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from build_schools_json import xlsx_rows


PUBLIC = Path(__file__).resolve().parents[1] / "public"
SOURCES = {
    "ela": ("nyc-ela-outcomes.xlsx", "https://infohub.nyced.org/docs/default-source/default-document-library/school-ela-results-public.xlsx"),
    "math": ("nyc-math-outcomes.xlsx", "https://infohub.nyced.org/docs/default-source/default-document-library/school-math-results-public.xlsx"),
    "graduation": ("nyc-graduation-outcomes.xlsx", "https://infohub.nyced.org/docs/default-source/default-document-library/2025-graduation-rates-public-school.xlsx"),
}
BOROUGH_LETTERS = {"Bronx": "X", "Brooklyn": "K", "Manhattan": "M", "Queens": "Q", "Staten Island": "R"}


def source_file(source_dir, name):
    filename, url = SOURCES[name]
    path = source_dir / filename
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "schools-map-data-builder/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response, path.open("wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
    return path


def dbn_for(nces_row, county):
    beds = nces_row["ST_SCHID"].split("-")[-1]
    if len(beds) != 12 or not beds.isdigit() or not 1 <= int(beds[2:4]) <= 32:
        return None
    return f"{beds[2:4]}{BOROUGH_LETTERS[county]}{beds[-3:]}"


def nces_directory(path):
    with zipfile.ZipFile(path) as archive:
        filename = next(name for name in archive.namelist() if name.endswith(".csv"))
        with io.TextIOWrapper(archive.open(filename), encoding="utf-8-sig", newline="") as source:
            return {row["NCESSCH"]: row for row in csv.DictReader(source)}


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def middle_results(path, sheet):
    rows = iter(xlsx_rows(path, sheet))
    headers = next(rows)
    by_school = defaultdict(list)
    for values in rows:
        row = dict(zip(headers, values))
        if row.get("Year") == 2026 and row.get("Grade") in (6, 7, 8) and row.get("Category") == "All Students":
            by_school[row["DBN"]].append(row)
    results = {}
    for dbn, grades in by_school.items():
        # A suppressed tested grade makes the combined result unavailable.
        if any(number(row.get("Number Tested")) is None for row in grades):
            continue
        valid = [row for row in grades if row["Number Tested"] > 0]
        if not valid or any(number(row.get("# Level 3+4")) is None for row in valid):
            continue
        tested = sum(row["Number Tested"] for row in valid)
        proficient = sum(row["# Level 3+4"] for row in valid)
        level4 = [number(row.get("# Level 4")) for row in valid]
        results[dbn] = {
            "tested": tested,
            "proficient": round(100 * proficient / tested, 1),
            "level4": round(100 * sum(level4) / tested, 1) if all(value is not None for value in level4) else None,
            "grades": [str(row["Grade"]) for row in sorted(valid, key=lambda row: row["Grade"])],
        }
    return results


def graduation_results(path):
    rows = iter(xlsx_rows(path, "All"))
    headers = next(rows)
    results = {}
    for values in rows:
        row = dict(zip(headers, values))
        if row.get("Cohort Year") != 2021 or row.get("Cohort") != "4 year August" or row.get("Category") != "All Students":
            continue
        rate = number(row.get("% Grads"))
        if rate is None:
            continue
        results[row["DBN"]] = {
            "rate": round(rate, 1),
            "cohortSize": number(row.get("# Total Cohort")),
            "regentsRate": round(value, 1) if (value := number(row.get("% Total Regents of Cohort"))) is not None else None,
        }
    return results


def enrich(source_dir):
    directory = nces_directory(source_dir / "ccd-directory.zip")
    ela = middle_results(source_file(source_dir, "ela"), "ELA - All")
    math = middle_results(source_file(source_dir, "math"), "Math - All")
    graduation = graduation_results(source_file(source_dir, "graduation"))
    for level in ("middle", "high"):
        path = PUBLIC / f"{level}-nyc-schools.json"
        schools = json.loads(path.read_text())
        ids = [dbn_for(directory[school["id"]], school["county"]) for school in schools]
        duplicates = {dbn for dbn, count in Counter(ids).items() if dbn is not None and count > 1}
        matched = 0
        for school, dbn in zip(schools, ids):
            school["reportUrl"] = None
            if level == "middle":
                school["ela"] = None
                school["math"] = None
                school["average"] = None
            else:
                school.pop("graduation", None)
            if dbn is None or dbn in duplicates:
                continue
            if level == "middle":
                school["ela"] = ela.get(dbn)
                school["math"] = math.get(dbn)
                school["average"] = round((school["ela"]["proficient"] + school["math"]["proficient"]) / 2, 1) if school["ela"] and school["math"] else None
                if school["ela"] or school["math"]:
                    school["reportUrl"] = "https://infohub.nyced.org/reports/academics/test-results"
                    matched += 1
            elif dbn in graduation:
                school["graduation"] = graduation[dbn]
                school["reportUrl"] = "https://infohub.nyced.org/reports/academics/graduation-results"
                matched += 1
        path.write_text(json.dumps(schools, separators=(",", ":")) + "\n")
        print(f"{level} NYC outcomes: {matched}/{len(schools)} schools (skipped {len(duplicates)} ambiguous DBNs)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("/tmp"))
    args = parser.parse_args()
    enrich(args.source_dir)
