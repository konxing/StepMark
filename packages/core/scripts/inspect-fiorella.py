#!/usr/bin/env python3
"""Ephemeral public-data QA for Fiorella (2026).

Runs only in the isolated Research OSF GitHub Actions workflow. Do not publish,
upload, or persist participant-level records. No user accounts are accessed.
"""
import collections
import csv
import hashlib
import io
import json
import urllib.request
import zipfile

OSF_ID = "zty5s"
FILENAME = "OSF_review_package.zip"
EXPECTED_SHA256 = "4eb4b87fd50390fe095f4119add927ec7fe8195b5e05b091a30123058cbe4e09"
ROOT = "OSF_review_package_revision2_FINAL/"
CSV_FILES = [
    "data/habit_daily_analysis_public.csv",
    "data/habit_longitudinal_model_dataset_public.csv",
    "model_outputs/manuscript_mixed_models/automaticity_growth_model.csv",
]
MAX_BYTES = 35_000_000
MAX_CSV_BYTES = 20_000_000

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "StepMark-research/1.0",
                                                "Accept": "application/vnd.api+json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)

def read_data():
    listing = get_json(f"https://api.osf.io/v2/nodes/{OSF_ID}/files/osfstorage/")
    match = next((x for x in listing["data"]
                  if x.get("attributes", {}).get("name") == FILENAME), None)
    if not match:
        raise RuntimeError("OSF_DATA_NOT_FOUND")
    download = match["links"]["download"]
    if not download.startswith(("https://osf.io/", "https://files.osf.io/")):
        raise RuntimeError("UNEXPECTED_SOURCE")
    with urllib.request.urlopen(download, timeout=75) as res:
        data = res.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise RuntimeError("OVERSIZED_DOWNLOAD")
    sha256 = hashlib.sha256(data).hexdigest()
    if sha256 != EXPECTED_SHA256:
        raise RuntimeError("UNEXPECTED_DATA_VERSION")
    return data, sha256

def read_csv(archive, path):
    info = archive.getinfo(ROOT + path)
    if info.file_size > MAX_CSV_BYTES:
        raise RuntimeError("CSV_TOO_LARGE")
    with archive.open(info) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text)
        columns = reader.fieldnames or []
        if len(columns) != len(set(columns)):
            raise RuntimeError("DUPLICATE_COLUMNS")
        rows = []
        for i, row in enumerate(reader):
            if i > 20000:
                raise RuntimeError("TOO_MANY_ROWS")
            if None in row:
                raise RuntimeError("MALFORMED_CSV")
            rows.append(row)
        return columns, rows

def summarize(path, columns, rows):
    summary = {"file": path, "rows": len(rows), "columnCount": len(columns),
               "columns": columns[:60]}
    for field in ["semester", "automaticity_score_type"]:
        if field in columns:
            vals = collections.Counter((row.get(field) or "<missing>") for row in rows)
            # These are only semester/measure categories, never participant IDs.
            summary[field] = dict(sorted(vals.items()))
    if "participant_id" in columns:
        summary["uniqueParticipantCount"] = len({
            row["participant_id"] for row in rows if row.get("participant_id")
        })
    for field in ["automaticity_score", "intention", "behavior",
                  "cumulative_prior_repetitions", "accumulated_prior_repetitions"]:
        if field not in columns:
            continue
        raw = [row.get(field, "").strip() for row in rows]
        numeric = []
        for value in raw:
            try:
                if value:
                    numeric.append(float(value))
            except ValueError:
                pass
        stats = {"present": sum(bool(v) for v in raw),
                 "missing": sum(not v for v in raw),
                 "numericCount": len(numeric)}
        if numeric:
            stats.update({"numericMin": min(numeric), "numericMax": max(numeric)})
        summary[field] = stats
    return summary

def main():
    data, sha256 = read_data()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        output = {"dataset": "Fiorella-2026",
                  "source": "https://osf.io/zty5s/",
                  "archiveSha256": sha256,
                  "archiveBytes": len(data),
                  "researchOnly": True,
                  "dataReuseLicense": "NOT_VERIFIED_IN_OSF_METADATA",
                  "tables": []}
        for path in CSV_FILES:
            columns, rows = read_csv(archive, path)
            output["tables"].append(summarize(path, columns, rows))
        daily = output["tables"][0]
        if daily.get("rows") != 9416 or daily.get("uniqueParticipantCount") != 175:
            raise RuntimeError("PUBLISHED_SAMPLE_COUNTS_MISMATCH")
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))

if __name__ == "__main__":
    main()
