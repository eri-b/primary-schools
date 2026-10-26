"""Enrich school JSON with official 2024–25 NCES charter status."""

import argparse
import csv
import io
import json
import urllib.request
import zipfile
from functools import lru_cache
from pathlib import Path

DIRECTORY_URL = "https://nces.ed.gov/ccd/data/zip/ccd_sch_029_2425_w_1a_073025.zip"


def charter_status(value):
    # Unknown status must never be interpreted as a non-charter school.
    return {"Yes": True, "No": False, "Not applicable": False}.get(value)


@lru_cache
def charter_statuses(source_dir=Path('/tmp')):
    path = source_dir / 'ccd-directory.zip'
    if not path.exists():
        source_dir.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(DIRECTORY_URL, headers={"User-Agent": "schools-map-data-builder/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        # Validate the archive before caching it.
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            archive.testzip()
        path.write_bytes(data)
    with zipfile.ZipFile(path) as archive:
        name = next(name for name in archive.namelist() if name.endswith('.csv'))
        with io.TextIOWrapper(archive.open(name), encoding='utf-8-sig', newline='') as stream:
            return {row['NCESSCH']: charter_status(row['CHARTER_TEXT']) for row in csv.DictReader(stream)}


def enrich(schools, source_dir=Path('/tmp')):
    statuses = charter_statuses(source_dir)
    for school in schools:
        school['isCharter'] = statuses.get(school['id'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=Path('/tmp'))
    args = parser.parse_args()
    public = Path(__file__).resolve().parents[1] / 'public'
    for path in sorted(public.glob('*schools.json')):
        schools = json.loads(path.read_text())
        if path.name == 'schools.json':
            # NYC elementary data comes exclusively from NYCPS district schools.
            for school in schools:
                school['isCharter'] = False
        else:
            enrich(schools, args.source_dir)
        path.write_text(json.dumps(schools, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
        print(f'{path.name}: {sum(s["isCharter"] is True for s in schools)} charter, '
              f'{sum(s["isCharter"] is None for s in schools)} unknown')


if __name__ == '__main__':
    main()
