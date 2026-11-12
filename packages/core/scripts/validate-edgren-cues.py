#!/usr/bin/env python3
"""Source-verified, aggregated cue-opportunity quality check; ephemeral CI only.

Edgren follow-up b69gp: preventing a no-cue day from being counted as failure.
This is NOT a causal estimate, health advice, or validation of our UI scores.
"""
import collections
import csv
import hashlib
import io
import json
import urllib.request

PROJECT = "b69gp"
NAME = "HABIRUPT_STUDY1_PAPER2_QUANTI_DATA_2025-06-16.csv"
GROUPS = ("SED", "SNA", "ALC", "TOB")
MAX_SIZE = 3_000_000
EXPECTED_SHA256 = "ccc57856568d7b06669714422918880238162008d4960f98b2ee03eaf5fab464"

def open_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.api+json",
                                               "User-Agent": "StepMark-research/1.0"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)

def get_data():
    url = f"https://api.osf.io/v2/nodes/{PROJECT}/files/osfstorage/"
    listing = open_json(url)
    item = next((obj for obj in listing.get("data", [])
                 if obj.get("attributes", {}).get("name") == NAME), None)
    if item is None:
        raise RuntimeError("SOURCE_FILE_NOT_FOUND")
    url = item["links"]["download"]
    if not url.startswith(("https://osf.io/", "https://files.osf.io/")):
        raise RuntimeError("INVALID_SOURCE_ORIGIN")
    with urllib.request.urlopen(url, timeout=50) as res:
        data = res.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise RuntimeError("FILE_TOO_LARGE")
    sha = hashlib.sha256(data).hexdigest()
    provider_hash = item["attributes"].get("extra", {}).get("hashes", {}).get("sha256")
    if sha != EXPECTED_SHA256:
        raise RuntimeError("PINNED_SOURCE_VERSION_CHANGED")
    if not provider_hash or provider_hash.lower() != sha:
        raise RuntimeError("SOURCE_HASH_MISMATCH")
    return data, sha

def classify(val, valid):
    value = (val or "").strip().strip('"')
    if value in ("NA", "", "NaN"):
        return "missing"
    if value in valid:
        return value
    raise RuntimeError("UNEXPECTED_CODE")

def summarize(data, sha):
    s = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(s, newline=""))
    required = ("respid", "BEHAV", "StudyDay", "D2CEXP", "D2CEXP1", "D2EXP2", "D2PE", "SRBAI")
    missing = [k for k in required if k not in (reader.fieldnames or [])]
    if missing:
        raise RuntimeError("MISSING_SCHEMA_COLUMN:" + ",".join(missing))
    counts = collections.Counter()
    per_group = {g:collections.Counter() for g in GROUPS}
    ids=set()
    score_present=0
    total=0
    for row in reader:
        if total>=17000:
            raise RuntimeError("ROW_LIMIT")
        total+=1
        group=row["BEHAV"]
        if group not in GROUPS:
            raise RuntimeError("INVALID_GROUP")
        cue=classify(row["D2CEXP"], ("0","1","2"))
        once=classify(row["D2CEXP1"], ("0","1"))
        several=classify(row["D2EXP2"], ("0","1","2"))
        enacted=classify(row["D2PE"], ("0","1"))
        score=row["SRBAI"]
        if score and score.strip() not in ("NA",""):
            f=float(score)
            if f<0 or f>4:
                raise RuntimeError("SRBAI_OUT_OF_RANGE")
            score_present+=1
        key=(group,row["respid"])
        ids.add(key)
        counts["cue_"+cue]+=1
        counts["plan_"+enacted]+=1
        per_group[group]["rows"]+=1
        per_group[group]["cue_"+cue]+=1
        per_group[group]["once_answer_"+once]+=1
        per_group[group]["several_answer_"+several]+=1
        per_group[group]["plan_"+enacted]+=1
        if cue=="0" and (once!="missing" or several!="missing"):
            per_group[group]["unexpected_response_without_cue"]+=1
    if total!=16490:
        raise RuntimeError("PUBLISHED_ROW_COUNT_MISMATCH")
    return {"status":"AGGREGATED_REAL_CUE_OPPORTUNITY_AUDIT",
      "source":"https://osf.io/b69gp/",
      "sourceFile":NAME,"sourceSha256":sha,
      "observations":total,"uniqueParticipants":len(ids),
      "srBAIReported":score_present,"srBAIMissing":total-score_present,
      "cueDistribution":{k:counts["cue_"+k] for k in ("0","1","2","missing")},
      "groups":{g:dict(sorted(v.items())) for g,v in per_group.items()},
      "individualRecordsRetained":False,
      "interpretation":"0 means no cue; 1 once; 2 multiple. D2PE is execution of a reduction plan, not a StepMark habit-completion label. No-cue is not a failed behavior opportunity. No per-person predictions or progress calibration performed.",
      "licenseForRedistribution":"UNVERIFIED"}

if __name__ == "__main__":
    data,sha=get_data()
    print(json.dumps(summarize(data,sha),sort_keys=True))
