"""Reproduce the committed CC0 aggregate from pinned upstream files (research only).
No raw records are written; no third-party AI or production API calls.
Python 3.10+, standard library; run from any directory.
"""
import csv
import hashlib
import io
import json
import math
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "docs/research/datasets"
MANIFEST = DATA / "open-dataset-catalog-2026-11-28.json"
EXPECTED = DATA / "openneuro-learning-habits-aggregate.csv"

def git_blob_sha1(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\x00" + data).hexdigest()

def inspect(data):
    reader = csv.DictReader(io.StringIO(data.decode("utf-8")), delimiter="\t")
    required = {"trial_type", "trial", "correct", "rt"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("unexpected schema")
    count = dict(event_rows=0, response_rows=0, correct=0, incorrect=0,
                 unknown_correctness=0, positive_rt_count=0, rt_sum=0.0)
    trials = set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("unexpected TSV width")
        count["event_rows"] += 1
        if row["trial_type"] != "response":
            continue
        trial = row["trial"]
        if not trial or trial in trials:
            raise ValueError("missing or duplicate trial")
        trials.add(trial)
        count["response_rows"] += 1
        label = {"1": "correct", "0": "incorrect"}.get(row["correct"], "unknown_correctness")
        count[label] += 1
        try:
            rt = float(row["rt"])
        except ValueError:
            continue
        if math.isfinite(rt) and rt > 0:
            count["positive_rt_count"] += 1
            count["rt_sum"] += rt
    return count

def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    source = next(x for x in manifest["datasets"] if x["id"] == "openneuro-learning-habits")
    if source["license"] != "CC0-1.0" or len(source["files"]) != 15:
        raise ValueError("unexpected source manifest")
    sums = {}
    for f in source["files"]:
        url = "https://raw.githubusercontent.com/" + source["repository"] + "/" + source["commit"] + "/" + f["path"]
        with urllib.request.urlopen(url, timeout=30) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000 or git_blob_sha1(raw) != f["gitBlobSha1"]:
            raise ValueError("source blob mismatch: " + f["path"])
        observed = inspect(raw)
        dest = sums.setdefault(f["run"], {"participants": 0, **{k: 0 for k in observed}})
        dest["participants"] += 1
        for k, v in observed.items():
            dest[k] += v
    with EXPECTED.open(encoding="utf-8", newline="") as fh:
        expected = list(csv.DictReader(fh))
    if set(sums) != {1, 2, 3} or len(expected) != 3:
        raise ValueError("run count mismatch")
    for row in expected:
        s = sums[int(row["run"])]
        if s["response_rows"] != s["correct"] + s["incorrect"] + s["unknown_correctness"]:
            raise ValueError("outcome partition mismatch")
        for key, value in row.items():
            if key == "run":
                continue
            if key == "mean_positive_rt_seconds":
                if not math.isclose(float(value), s["rt_sum"]/s["positive_rt_count"], abs_tol=5.1e-7, rel_tol=0):
                    raise ValueError("RT mismatch")
            elif int(value) != s[key]:
                raise ValueError("count mismatch: " + key)
    print("Verified 15 source Git blobs and all three aggregate fixture rows.")

if __name__ == "__main__":
    main()
