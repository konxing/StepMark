"""Offline validation of committed research fixtures; optional pinned upstream check."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "docs/research/datasets/habit-ability"

def read(name):
    with (DATA / name).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

def verify():
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))["sources"]
    assert len(sources) == 13 and len({s["id"] for s in sources}) == 13
    groups = read("routine-formation-published-groups.csv")
    assert len(groups) == 6
    for r in groups:
        assert 0 <= float(r["mean"]) <= 100 and float(r["sd"]) >= 0
        assert r["scale_min"] == "0" and r["scale_max"] == "100"
    assert sum(int(r["n"]) for r in groups if r["measure"] == "day28_srbai") == 131
    effects = read("routine-formation-published-effects.csv")
    assert len(effects) == 15
    for r in effects:
        x, p = float(r["estimate"]), float(r["p_value"])
        assert math.isfinite(x) and 0 <= p <= 1 and r["p_operator"] in {"=", "<", ">"}
        if r["statistic"] == "r":
            assert -1 <= x <= 1
    assert any(r["predictor"] == "working_memory_ospan" and r["statistic"] == "r" and float(r["estimate"]) < 0 for r in effects)
    motor = read("motor-habit-gd3-aggregate.csv")
    assert len(motor) == 2 and sum(int(r["n"]) for r in motor) == 306
    print("Offline fixture shape and numeric invariants passed (not a model validation).")
    return sources, motor

def verify_motor(sources, motor):
    s = next(x for x in sources if x["id"] == "motor-habit-gd3")
    url = "https://raw.githubusercontent.com/" + s["repository"] + "/" + s["revision"] + "/" + s["path"]
    with urlopen(url, timeout=30) as response:
        raw = response.read(100001)
    if len(raw) > 100000 or hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\x00" + raw).hexdigest() != s["gitBlobSha1"]:
        raise ValueError("Source file integrity mismatch")
    groups = {}
    ids = set()
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8"))):
        if not row["newID"] or row["newID"] in ids:
            raise ValueError("Duplicate or missing ID")
        ids.add(row["newID"])
        groups.setdefault(row["group"], []).append(row)
    assert set(groups) == {r["group"] for r in motor}
    for expected in motor:
        rows = groups[expected["group"]]
        assert len(rows) == int(expected["n"])
        for key in ("pre_val", "pre_deval", "post_val", "post_deval", "CHANGE_SCORE"):
            values = [float(r[key]) for r in rows]
            assert all(math.isfinite(v) for v in values)
            assert math.isclose(sum(values)/len(values), float(expected[key.lower()+"_mean"]), rel_tol=0, abs_tol=5.1e-7)
    print("Pinned original file and group statistics verified.")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--verify-motor-source", action="store_true")
    a = p.parse_args()
    s, m = verify()
    if a.verify_motor_source:
        verify_motor(s, m)
