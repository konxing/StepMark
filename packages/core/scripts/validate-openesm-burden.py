#!/usr/bin/env python3
"""Research-only source-pinned openESM Hasselhorn Study 2 burden audit.

Only record-level data in a disposable runner; stdout contains aggregate
statistics and provenance, never participant IDs, diary text, or raw records.
The source is CC BY-NC 4.0 and is not for commercial model training.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import sys
from collections import defaultdict
from urllib.request import Request, urlopen

SOURCE = {
    "dataset": "0025_hasselhorn",
    "zenodoRecord": "22953033",
    "version": "2.0.0",
    "url": "https://zenodo.org/records/22953033/files/0025_hasselhorn_ts.tsv?download=1",
    "publishedFile": "0025_hasselhorn_ts.tsv",
    "md5": "87c1fd9570dc694a8c537ea6c35e7e26",
    "license": "CC BY-NC 4.0 — noncommercial research only",
    "paper": "https://doi.org/10.3758/s13428-021-01683-6",
    "repository": "https://openesmdata.org/datasets/0025_hasselhorn/",
}
MAX_BYTES = 5_000_000
EMPTY = {"", "NA", "N/A", "NaN", "nan", "null", "None"}

def read_code(value: str, *, binary: bool = False) -> int | None:
    value = (value or "").strip()
    if value in EMPTY:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("unexpected numeric scale coding") from exc
    if not math.isfinite(number) or not number.is_integer():
        raise ValueError("noninteger recorded response")
    number = int(number)
    if binary and number not in (0, 1):
        raise ValueError("nonbinary compliance code")
    return number

def audit_tsv(raw: bytes, *, verify_hash: bool = True) -> dict:
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_BYTES:
        raise ValueError("missing or oversized source data")
    actual_md5 = hashlib.md5(raw).hexdigest()  # official deposit-fixity only, not security
    if verify_hash and actual_md5 != SOURCE["md5"]:
        raise ValueError("pinned source hash mismatch; do not infer dataset versions")
    source_sha256 = hashlib.sha256(raw).hexdigest()
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t")
        fields = reader.fieldnames or []
        if not {"id", "day", "compliance", "study_burden"}.issubset(fields):
            raise ValueError("unexpected dataset schema; verify codebook manually")
        # Build only aggregate counters by study day, and a bounded dictionary
        # of per-person week responses. Never log respondent identifiers.
        items = []
        for row in reader:
            if len(items) >= 60000:
                raise ValueError("too many recorded rows")
            if None in row:
                raise ValueError("malformed TSV row")
            subject = (row.get("id") or "").strip()
            if not subject or len(subject) > 128:
                raise ValueError("missing participant identifier")
            day = read_code(row.get("day", ""))
            if day is None or not 0 <= day <= 14:
                raise ValueError("unexpected study day")
            compliance = read_code(row.get("compliance", ""), binary=True)
            burden = read_code(row.get("study_burden", ""))
            if burden is not None and not 1 <= burden <= 5:
                raise ValueError("unexpected burden scale")
            items.append((subject, day, compliance, burden))
    except UnicodeDecodeError as exc:
        raise ValueError("unexpected source text encoding") from exc
    if not items:
        raise ValueError("no observations")
    min_day = min(x[1] for x in items)
    if min_day not in (0, 1):
        raise ValueError("study-day origin unknown; do not guess early/late periods")
    earliest = min_day
    groups = [{"rows": 0, "known": 0, "yes": 0, "no": 0,
               "burden_count": 0, "burden_total": 0} for _ in range(2)]
    people: dict[str, list[list[int]]] = defaultdict(lambda: [[0, 0], [0, 0]])
    for subject, day, compliance, burden in items:
        i = 0 if day - earliest < 7 else 1
        g = groups[i]
        g["rows"] += 1
        if compliance is not None:
            g["known"] += 1
            g["yes"] += compliance
            g["no"] += 1 - compliance
            people[subject][i][0] += compliance
            people[subject][i][1] += 1
        if burden is not None:
            g["burden_count"] += 1
            g["burden_total"] += burden
    def report(g: dict) -> dict:
        return {
            "recordedRows": g["rows"],
            "explicitComplianceYes": g["yes"],
            "explicitComplianceNo": g["no"],
            "complianceUnknownOnRecordedRows": g["rows"] - g["known"],
            "knownComplianceRate": round(g["yes"] / g["known"], 6) if g["known"] else None,
            "burdenRecorded": g["burden_count"],
            "meanRecordedBurden": round(g["burden_total"] / g["burden_count"], 6) if g["burden_count"] else None,
        }
    pairs = []
    for rows in people.values():
        (yes_a, count_a), (yes_b, count_b) = rows
        if count_a and count_b:
            pairs.append(yes_b/count_b - yes_a/count_a)
    return {
        "status": "descriptive_external_noncommercial_research_only",
        "provenance": {**SOURCE, "sha256": source_sha256},
        "recordedRows": len(items),
        "participantCount": len(people),
        "firstSevenStudyDays": report(groups[0]),
        "lastSevenStudyDays": report(groups[1]),
        "participantsWithPairedKnownCompliance": len(pairs),
        "meanWithinParticipantLastMinusFirstRecordedCompliance":
            round(sum(pairs)/len(pairs), 6) if pairs else None,
        "scope": "Counts cover existing recorded rows ONLY. No raw beep timestamps: unrecorded scheduled prompts are unknown, and cannot be inserted as zeros. Changes are descriptive, not causal, not StepMark habit automaticity and not validated prompt-frequency optimization.",
    }

def main():
    if sys.argv[1:] != ["--pinned-remote"]:
        raise ValueError("Usage: python validate-openesm-burden.py --pinned-remote")
    request = Request(SOURCE["url"], headers={"User-Agent": "StepMark-noncommercial-research/1.0"})
    with urlopen(request, timeout=25) as stream:
        data = stream.read(MAX_BYTES + 1)
    summary = audit_tsv(data, verify_hash=True)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        sys.stderr.write("OpenESM audit blocked: " + str(exc) + "\n")
        sys.exit(1)
