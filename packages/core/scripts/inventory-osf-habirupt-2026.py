#!/usr/bin/env python3
"""Metadata-only inventory of the published 2026 HABIRUPT RCT dataset.

Does not download or print participant rows, nor assume public access means
permission for redistribution or commercial reuse.
"""
import json
import urllib.request
from urllib.parse import urlparse

PROJECT="z7tby"
API=f"https://api.osf.io/v2/nodes/{PROJECT}/"
HEADERS={"Accept":"application/vnd.api+json","User-Agent":"StepMark-open-research-inventory/1.0"}
def fetch_json(url):
    parsed=urlparse(url)
    if parsed.scheme!="https" or parsed.hostname!="api.osf.io":
        raise RuntimeError("UNTRUSTED_OSF_LINK")
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=20) as resp:
        if int(resp.headers.get("Content-Length","0"))>1_000_000:
            raise RuntimeError("OVERSIZE_RESPONSE")
        raw=resp.read(1_000_001)
    if len(raw)>1_000_000:
        raise RuntimeError("OVERSIZE_RESPONSE")
    return json.loads(raw)
def inventory():
    node=fetch_json(API)["data"]
    attrs=node.get("attributes") or {}
    licensing=node.get("relationships",{}).get("license",{}).get("data")
    listing=fetch_json(API+"files/osfstorage/")
    entries=[]
    cursor=listing
    pages=0
    while True:
        for obj in cursor.get("data",[]):
            a=obj.get("attributes",{})
            if len(entries)>=150:raise RuntimeError("TOO_MANY_FILES")
            entries.append({"name":str(a.get("name",""))[:150],
              "kind":a.get("kind"),"sizeBytes":a.get("size"),
              "sha256":(a.get("extra") or {}).get("hashes",{}).get("sha256"),
              "downloadOrigin":urlparse((obj.get("links") or {}).get("download","")).hostname})
        next_url=(cursor.get("links") or {}).get("next")
        if not next_url:break
        pages+=1
        if pages>5:raise RuntimeError("TOO_MANY_PAGES")
        cursor=fetch_json(next_url)
    return {"status":"METADATA_ONLY_LICENSE_UNVERIFIED",
      "project":"https://osf.io/"+PROJECT+"/",
      "projectTitle":attrs.get("title"),"public":attrs.get("public"),
      "licenseMetadata":licensing,"files":entries,
      "participantRecordsDownloaded":False,
      "reusesDataCommercially":False,
      "limits":"Open availability is not license authorization. Inspect original dictionary/IRB terms before further reuse."}
if __name__=="__main__":
    print(json.dumps(inventory(),ensure_ascii=False,sort_keys=True))
