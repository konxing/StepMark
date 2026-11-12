#!/usr/bin/env python3
"""Metadata and schema-only integrity inspection of public HABIRUPT RCT files.

Rows are held in-memory on a disposable GitHub Actions runner and never printed,
committed, or persisted into a StepMark production database.
"""
import csv
import hashlib
import io
import json
import urllib.request
from urllib.parse import urlparse

PROJECT = "z7tby"
FILES = {
 "Readme_SRBAI_TS_DATA_INFO.txt": ("0ea82ff56890f2a87fb96fad261d2dc6d8f7f7edcad7747db3ad3b19ecf13d9d", 10000),
 "Readme_GroupLevel_AnalysisVariables_DATA_INFO.txt": ("7cadb758fed033b1605ca2302d19ff504b8999381982e1c7220d84616e5bde48", 12000),
 "SRBAI_TS_2025-18-08.csv": ("622c0f673ac2d260fd3b582a5921ab1f6d3ca3b10fa2b5869d38af6edcdc7543", 800000),
 "GroupLevel_AnalysisVariables_2025-08-18.csv": ("58fb369f745ef8205e4512cbdfc8e23694799c370abcb7b1ce7d1f7d766ec282", 100000),
}
API=f"https://api.osf.io/v2/nodes/{PROJECT}/files/osfstorage/"
def open_json(url):
 if urlparse(url).hostname!="api.osf.io":raise RuntimeError("UNTRUSTED_API_HOST")
 req=urllib.request.Request(url,headers={"Accept":"application/vnd.api+json","User-Agent":"StepMark-research/1.0"})
 with urllib.request.urlopen(req,timeout=20) as resp:
  return json.loads(resp.read(1000000))
def read_source(item, expected_sha, size_cap):
 link=item.get("links",{}).get("download","")
 if urlparse(link).hostname not in ("osf.io","files.osf.io") or not link.startswith("https://"):
  raise RuntimeError("INVALID_SOURCE_ORIGIN")
 with urllib.request.urlopen(link,timeout=50) as resp:
  raw=resp.read(size_cap+1)
 if len(raw)>size_cap:raise RuntimeError("FILE_TOO_LARGE")
 h=hashlib.sha256(raw).hexdigest()
 if h!=expected_sha or h!=item.get("attributes",{}).get("extra",{}).get("hashes",{}).get("sha256"):
  raise RuntimeError("CHECKSUM_MISMATCH")
 return raw
def safe_info(text):
 # Citation, variable legend, and scale descriptions only.
 # No original study participants, diary values, or free-text contents.
 return text[:7000]
def main():
 files={x.get("attributes",{}).get("name"):x for x in open_json(API).get("data",[])}
 info=[]
 for name,(expected,cap) in FILES.items():
  item=files.get(name)
  if not item:raise RuntimeError("REQUIRED_FILE_MISSING: "+name)
  raw=read_source(item,expected,cap)
  if name.endswith(".txt"):
   info.append({"file":name,"sha256":expected,"documentation":safe_info(raw.decode("utf-8-sig"))})
  else:
   text=raw.decode("utf-8-sig")
   reader=csv.reader(io.StringIO(text,newline=""))
   header=next(reader)
   count=sum(1 for _ in reader)
   if count<50 or count>30000:raise RuntimeError("ROW_COUNT_UNEXPECTED")
   info.append({"file":name,"sha256":expected,"rows":count,"columns":header,
      "individualRecordsPrinted":False})
 print(json.dumps({"status":"PINNED_RCT_SCHEMA_VERIFIED","source":"https://osf.io/"+PROJECT+"/",
  "license":"DATASET_SPECIFIC_RIGHTS_UNREVIEWED","files":info},ensure_ascii=False))
if __name__=="__main__":main()
