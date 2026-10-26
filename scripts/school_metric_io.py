"""Preserve separately sourced, dated metrics when rebuilding base school data."""
import json


def retain_metrics(path, schools):
    if path.exists():
        existing = {school.get('id', school.get('dbn')): school.get('metrics')
                    for school in json.loads(path.read_text())}
        for school in schools:
            key = school.get('id', school.get('dbn'))
            if key and key in existing and existing[key] is not None and 'metrics' not in school:
                school['metrics'] = existing[key]
    return schools


def write_schools(path, schools):
    retain_metrics(path, schools)
    path.write_text(json.dumps(schools, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
