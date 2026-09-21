import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "NYC_Public_Elementary_School_Comparison_2025-26.csv"
JSON_PATH = ROOT / "public" / "schools.json"


def number(row, column):
    value = row[column].strip()
    if value.startswith((">", "<")):
        return value
    return float(value) if "." in value else int(value)


with JSON_PATH.open(encoding="utf-8") as source:
    coordinates = {
        school["dbn"]: {"lat": school["lat"], "lng": school["lng"]}
        for school in json.load(source)
    }

schools = []
with CSV_PATH.open(encoding="utf-8-sig", newline="") as source:
    for row in csv.DictReader(source):
        location = coordinates[row["DBN"]]
        schools.append(
            {
                **location,
                "dbn": row["DBN"],
                "name": row["School Name"],
                "borough": row["Borough"],
                "district": number(row, "District"),
                "grades": row["Grade Span"],
                "enrollment": number(row, "Enrollment"),
                "elaTested": number(row, "ELA Students Tested"),
                "elaMeanScore": number(row, "ELA Mean Scale Score"),
                "ela": number(row, "ELA % Proficient"),
                "elaLevel4": number(row, "ELA % Level 4"),
                "elaPctile": number(row, "ELA Proficiency Percentile (NYC Schools)"),
                "mathTested": number(row, "Math Students Tested"),
                "mathMeanScore": number(row, "Math Mean Scale Score"),
                "math": number(row, "Math % Proficient"),
                "mathLevel4": number(row, "Math % Level 4"),
                "mathPctile": number(row, "Math Proficiency Percentile (NYC Schools)"),
                "average": number(row, "Average % Proficient"),
                "averagePctile": number(row, "Average Proficiency Percentile (NYC Schools)"),
                "asian": number(row, "% Asian and Pacific Islander"),
                "black": number(row, "% Black"),
                "hispanic": number(row, "% Hispanic"),
                "white": number(row, "% White"),
                "multiracial": number(row, "% Multi-Racial"),
                "nativeAmerican": number(row, "% Native American"),
                "swd": number(row, "% Students with Disabilities"),
                "ell": number(row, "% English Language Learners"),
                "poverty": number(row, "% Poverty"),
                "eni": number(row, "Economic Need Index"),
            }
        )

with JSON_PATH.open("w", encoding="utf-8") as destination:
    json.dump(schools, destination, ensure_ascii=False, separators=(",", ":"))
    destination.write("\n")
