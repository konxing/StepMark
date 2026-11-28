"""Inspect Figshare v4 metadata or explicitly fetch one rights-checked file outside Git.
No third-party AI, no automatic extraction, no production data writes.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

API = "https://api.figshare.com/v2/articles/23309678/versions/4"
ROOT = Path(__file__).resolve().parents[3]
MAX_BYTES = 256 * 1024 * 1024

def metadata():
    with urlopen(API, timeout=30) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("Oversized metadata")
    item = json.loads(raw)
    if item.get("id") != 23309678 or item.get("version") != 4:
        raise ValueError("Unexpected dataset/version")
    return item

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file-id", type=int)
    p.add_argument("--out", type=Path)
    a = p.parse_args()
    m = metadata()
    license = m.get("license") or {}
    files = m.get("files") or []
    print(json.dumps({"id":m["id"],"version":m["version"],"license":license,
        "files":[{k:f.get(k) for k in ("id","name","size","computed_md5","supplied_md5")} for f in files]}, indent=2))
    if a.file_id is None:
        return
    if a.out is None:
        p.error("--out outside the repository is mandatory")
    # Allow only explicit CC BY 4.0 or CC0 at this version, not article-license inference.
    rights = str(license.get("url","")).rstrip("/").replace("http://","https://")
    if rights not in {"https://creativecommons.org/licenses/by/4.0","https://creativecommons.org/publicdomain/zero/1.0"}:
        raise ValueError("Dataset license not confirmed for this acquisition")
    f = next((x for x in files if x.get("id") == a.file_id), None)
    if not f:
        raise ValueError("File ID not in version")
    name = f["name"]
    if Path(name).name != name or "/" in name or "\\" in name or name in {".",".."}:
        raise ValueError("Unsafe file name")
    dest = a.out.expanduser().resolve()
    if dest == ROOT or ROOT in dest.parents:
        raise ValueError("Do not write original participant data into this repository")
    url = f["downloadUrl"]
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in {"figshare.com","api.figshare.com","ndownloader.figshare.com","download.figshare.com"}:
        raise ValueError("Unexpected download URL")
    size = f.get("size")
    expected = f.get("computed_md5") or f.get("supplied_md5")
    if not isinstance(size,int) or not 0 < size <= MAX_BYTES or not isinstance(expected,str) or len(expected)!=32:
        raise ValueError("Missing integrity or size metadata")
    with urlopen(url, timeout=60) as response:
        raw = response.read(size+1)
    if len(raw)!=size or hashlib.md5(raw).hexdigest().lower()!=expected.lower():
        raise ValueError("File integrity mismatch")
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / name
    with target.open("xb") as fh:
        fh.write(raw)
    print(json.dumps({"file":name,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}, indent=2))
    print("Review original data dictionary, privacy and file-specific rights before analysis. Do not commit or send raw records to an AI.")

if __name__ == "__main__":
    main()
