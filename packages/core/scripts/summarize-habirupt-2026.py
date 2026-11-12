#!/usr/bin/env python3
"""Pinned 2026 RCT descriptive statistics, no participant-level output."""
import csv,io,json,runpy
from collections import defaultdict
from pathlib import Path
from missingness_bounds import bounded_change_summary,contrast_to_reference
helpers=runpy.run_path(str(Path(__file__).parent/"inspect-osf-habirupt-2026.py"))
catalog={a["attributes"]["name"]:a for a in helpers["open_json"](helpers["API"])["data"]}
def rows(name):
 checksum,cap=helpers["FILES"][name]
 raw=helpers["read_source"](catalog[name],checksum,cap)
 return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline="")))
def num(s):
 if s is None or s.strip() in ("","NA","NaN"):return None
 n=float(s)
 if not 0<=n<=4:raise ValueError("INVALID_SRBAI")
 return n
def main():
 users=rows("GroupLevel_AnalysisVariables_2025-08-18.csv")
 diary=rows("SRBAI_TS_2025-18-08.csv")
 if len(users)!=313 or len(diary)!=26605:raise ValueError("SOURCE_ROW_COUNT_CHANGED")
 byid={}
 for u in users:
  uid=u["id_users"]
  if uid in byid:raise ValueError("DUPLICATE_ID")
  u["intervention_arm"]=u["intervention_arm"].strip().lower()
  if u["intervention_arm"] not in ("control","inhibition","substitution","discontinuation","discontinuation_avb"):
   raise ValueError("UNKNOWN_ARM:"+repr(u["intervention_arm"]))
  byid[uid]=u
 groups=defaultdict(lambda:{"participants":0,"rows":0,"missing":0,"sum":0.0,"observed":0,
                            "pairedChanges":[]})
 for u in users:
  arm=u["intervention_arm"]
  groups[arm]["participants"]+=1
  a,b=num(u["D7_SRBAI"]),num(u["D91_SRBAI"])
  groups[arm].setdefault("allPairs",[]).append((a,b))
  if a is not None and b is not None:groups[arm]["pairedChanges"].append(b-a)
 for r in diary:
  if r["id_users"] not in byid:raise ValueError("UNLINKED_DIARY")
  if not 0<=int(r["esm_day"])<=84:raise ValueError("BAD_STUDY_DAY")
  arm=byid[r["id_users"]]["intervention_arm"]
  g=groups[arm];g["rows"]+=1
  value=num(r["SRBAI"])
  if value is None:g["missing"]+=1
  else:g["observed"]+=1;g["sum"]+=value
 result={}
 bounds={arm:bounded_change_summary(g["allPairs"]) for arm,g in groups.items()}
 for arm,g in sorted(groups.items()):
  changes=g["pairedChanges"]
  result[arm]={"participants":g["participants"],"studyDayRows":g["rows"],
    "observedSRBAI":g["observed"],"missingSRBAI":g["missing"],
    "missingFraction":round(g["missing"]/g["rows"],4),
    "observedMeanSRBAI0to4":round(g["sum"]/g["observed"],4) if g["observed"] else None,
    "pairedBaselineEndN":len(changes),
    "descriptiveEndMinusBaseline":round(sum(changes)/len(changes),4) if changes else None,
    "missingOutcomeIdentification":bounds[arm]}
 print(json.dumps({"status":"RESEARCH_ONLY_PINNED_RCT_DESCRIPTIVE",
   "source":"https://osf.io/z7tby/","people":len(users),"rows":len(diary),
   "groups":result,
   "groupContrastsVsControl":{arm:contrast_to_reference(bounds[arm],bounds["control"])
     for arm in sorted(groups) if arm!="control"},
   "participantRowsPrinted":False,"commercialReusePermission":"NOT_VERIFIED",
   "warning":"Unadjusted descriptive groups and extreme-case missing-outcome bounds. The bounds are not CIs, missing mechanisms are unresolved, and group change contrasts are not adjusted causal effects."},
   sort_keys=True))
if __name__=="__main__":main()
