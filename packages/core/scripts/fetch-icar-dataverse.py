#!/usr/bin/env python3
"""Download-only adapter: Harvard Dataverse ICAR scored response CSV (CC0 V3).

No quiz questions, item text or answer keys; only original scored 0/1 responses.
This script fails closed on file identity, size, checksum and metadata version.
"""
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DOI="doi:10.7910/DVN/AD9RVY"
FILENAME="sapaICARData18aug2010thru20may2013.csv"
# Independently published raw file checksum, corroborate with Dataverse file metadata:
# https://mindrankiq.com/about/ ; check against original source if it changes.
EXPECTED_SHA256="27b22368434e94278d4cfee238770339f8e90da6229ef9ffd95900c4972426e5"
EXPECTED_BYTES=18796756
HOST="https://dataverse.harvard.edu"

def download(output):
    params=urllib.parse.urlencode({"persistentId":DOI})
    url=HOST+"/api/datasets/:persistentId/?"+params
    req=urllib.request.Request(url,headers={"User-Agent":"StepMark-offline-research/1.0"})
    with urllib.request.urlopen(req,timeout=45) as response:
        meta=json.load(response)
    if meta.get("status")!="OK":
        raise ValueError("DATAVERSE_METADATA_FAILED")
    version=meta.get("data",{}).get("latestVersion",{})
    if version.get("versionNumber")!=3:
        raise ValueError("DATAVERSE_VERSION_CHANGED")
    matching=[f["dataFile"] for f in version.get("files",[])
              if f.get("dataFile",{}).get("filename")==FILENAME]
    if len(matching)!=1:
        raise ValueError("ICAR_SCORED_FILE_NOT_UNIQUE")
    file=matching[0]
    file_id=file.get("id")
    if not isinstance(file_id,int):
        raise ValueError("DATAVERSE_ID_INVALID")
    fileurl=HOST+"/api/access/datafile/"+str(file_id)+"?format=original"
    req=urllib.request.Request(fileurl,headers={"User-Agent":"StepMark-offline-research/1.0"})
    h=hashlib.sha256()
    size=0
    try:
        with urllib.request.urlopen(req,timeout=90) as remote,open(output,"wb") as out:
            while True:
                chunk=remote.read(1024*1024)
                if not chunk:
                    break
                size+=len(chunk)
                if size>EXPECTED_BYTES:
                    raise ValueError("DATAVERSE_FILE_TOO_LARGE")
                h.update(chunk)
                out.write(chunk)
        if size!=EXPECTED_BYTES or h.hexdigest()!=EXPECTED_SHA256:
            raise ValueError("DATAVERSE_CHECKSUM_MISMATCH")
    except Exception:
        Path(output).unlink(missing_ok=True)
        raise
    print(json.dumps({"status":"VERIFIED_DATAVERSE_RAW_CC0_CSV",
                     "sourceDoi":DOI,"sourceVersion":"V3",
                     "sha256":h.hexdigest(),"bytes":size,
                     "fileStoredOnlyInRunnerTemp":True}))

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: fetch-icar-dataverse.py <temp-output.csv>")
    try:
        download(sys.argv[1])
    except Exception as e:
        print("ICAR source acquisition failed:",type(e).__name__,str(e),file=sys.stderr)
        raise SystemExit(1)
