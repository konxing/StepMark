/**
 * Offline descriptive validation of consented, pseudonymous StepMark A/B item
 * responses. It deliberately NEVER estimates latent ability or claims equating.
 * No ingestion of the HabitApp behavioral experiment or OECD items is allowed.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

export const FORM_CODES=["logic-a-v1","logic-b-v1"];
export const SKILL_CODES=["conditional","evidence","quantitative"];
const HEADER="participant_id,form_code,task_order,skill_code,correct,study_day";
const EXPECTED_SKILLS=["conditional","conditional","evidence","evidence","quantitative","quantitative"];
const MIN_MATCHED=10;
export function parseReasoningCsv(raw){
  if(Buffer.byteLength(raw,"utf8")>20_000_000)throw new Error("FILE_TOO_LARGE");
  const lines=raw.trim().split(/\r?\n/);
  if(lines.shift()?.trim()!==HEADER)throw new Error("INCOMPATIBLE_SCHEMA");
  if(lines.length>120000)throw new Error("TOO_MANY_ROWS");
  const rows=[];
  const unique=new Set();
  for(const line of lines){
    if(!line.trim())continue;
    const parts=line.split(",");
    if(parts.length!==6)throw new Error("INVALID_REASONING_ROW");
    const [participant,form,order,skill,correct,day]=parts;
    if(!/^p_[A-Za-z0-9]{8,64}$/.test(participant)||
       !FORM_CODES.includes(form)||!/^[1-6]$/.test(order)||
       skill!==EXPECTED_SKILLS[Number(order)-1]|| !/^[01]$/.test(correct)||
       !/^(0|[1-9][0-9]{0,5})$/.test(day))throw new Error("INVALID_REASONING_ROW");
    const key=[participant,form,order].join("|");
    if(unique.has(key))throw new Error("DUPLICATE_TASK_RESPONSE");
    unique.add(key);
    rows.push({participant,form,order:Number(order),skill,correct:Number(correct),day:Number(day)});
  }
  if(!rows.length)throw new Error("EMPTY_DATASET");
  return rows;
}

/** Permission and integrity are *hard* prerequisites, not statistical metadata. */
export function validateReasoningManifest(manifest,sha256){
  if(!manifest||manifest.datasetKind!=="stepmark-consented-item-responses"||
      manifest.purpose!=="descriptive-independent-form-audit"||
      manifest.participantIdsPseudonymous!==true||
      manifest.explicitResearchConsentConfirmed!==true||
      manifest.rightsReviewed===false||manifest.rightsReviewed!==true||
      manifest.sourceVersion?.length<2||manifest.citation?.length<8||
      !/^https:\/\//.test(manifest.sourceUrl??"")||
      !/^[a-f0-9]{64}$/.test(sha256)||
      manifest.sha256?.toLowerCase()!==sha256){
    throw new Error("UNVERIFIED_REASONING_SOURCE_RIGHTS_OR_CHECKSUM");
  }
  return {datasetKind:manifest.datasetKind,purpose:manifest.purpose,
    citation:manifest.citation,sourceVersion:manifest.sourceVersion,sha256,
    sourceUrl:manifest.sourceUrl};
}
export function describeReasoningFormEvidence(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>120000)
    throw new Error("INVALID_DATASET_SIZE");
  const byPerson=new Map();
  for(const r of rows){
    const key=r.participant;
    if(!byPerson.has(key))byPerson.set(key,{a:[],b:[]});
    byPerson.get(key)[r.form==="logic-a-v1"?"a":"b"].push(r);
  }
  let completedA=0,completedB=0,invalidPairs=0,missingPairs=0;
  const matched=[];
  function complete(rows,form){
    if(rows.length!==6||rows.some((r,i)=>r.form!==form))return false;
    const seen=new Set(rows.map(r=>r.order));
    return seen.size===6 && EXPECTED_SKILLS.every((s,i)=>
      rows.some(r=>r.order===i+1&&r.skill===s));
  }
  for(const pair of byPerson.values()){
    const a=complete(pair.a,"logic-a-v1"),b=complete(pair.b,"logic-b-v1");
    if(a)completedA++;if(b)completedB++;
    if(!a||!b){missingPairs++;continue;}
    const aDate=Math.max(...pair.a.map(r=>r.day));
    const bDate=Math.max(...pair.b.map(r=>r.day));
    if(bDate<aDate+7){invalidPairs++;continue;}
    matched.push(pair);
  }
  if(matched.length<MIN_MATCHED)throw new Error("INSUFFICIENT_MATCHED_PARTICIPANTS");
  const mean=(values)=>Number((values.reduce((s,x)=>s+x,0)/values.length).toFixed(4));
  const scores=(pair,form,skill)=>
    pair[form].filter(r=>skill===null||r.skill===skill).reduce((s,r)=>s+r.correct,0)/
    pair[form].filter(r=>skill===null||r.skill===skill).length;
  const summarize=(skill)=>{
    const delta=matched.map(pair=>100*(scores(pair,"b",skill)-scores(pair,"a",skill)));
    return {domain:skill??"all",matchedPeople:matched.length,
      baselineMeanPercent:mean(matched.map(pair=>100*scores(pair,"a",skill))),
      followupMeanPercent:mean(matched.map(pair=>100*scores(pair,"b",skill))),
      pairedRawDifferencePoints:mean(delta)};
  };
  return {
    status:"descriptive_unlinked_forms_only",
    population:{participants:byPerson.size,completedA,completedB,
      matchedPeople:matched.length,incompleteOrUnmatched:missingPairs,
      insufficientRetestInterval:invalidPairs},
    summary:summarize(null),domains:SKILL_CODES.map(s=>summarize(s)),
    interpretation:"Descriptive matched response rates only; item difficulty, equating, " +
      "retest practice, participant selection and calibration are unresolved. " +
      "Differences are NOT validated improvement, effects of training or ability scores."
  };
}

/** A public behavioral response dataset is an explicit negative control. */
export function assessExternalDatasetUse(kind,target){
  const knownKinds=["habitapp-behavior-counts","pisa-cognitive-items","piaac-cognitive-items"];
  const knownTargets=["habit-behavior-description","external-item-methods",
    "stepmark-logic-form-calibration"];
  if(!knownKinds.includes(kind)||!knownTargets.includes(target))
    throw new Error("UNKNOWN_SOURCE_OR_PURPOSE");
  const eligible=kind==="habitapp-behavior-counts" && target==="habit-behavior-description";
  return {eligible,
    reason:eligible?"HabitApp experimental response counts support descriptive task contrasts.":
      kind==="habitapp-behavior-counts"?
      "Behavior counts have no scored cognitive item responses and cannot calibrate reasoning forms.":
      target==="external-item-methods"?
      "Candidate for separate methods research only after codebook, rights, file and score mapping review.":
      "External tests have no verified item link to StepMark's original A/B forms; not calibration evidence."};
}
async function main(){
  if(process.argv.length!==6||process.argv[2]!=="--input"||process.argv[4]!=="--manifest")
    throw new Error("Usage: node ... --input consented-responses.csv --manifest rights.json");
  const [bytes,rawManifest]=await Promise.all([readFile(process.argv[3]),readFile(process.argv[5],"utf8")]);
  if(bytes.length>20_000_000||rawManifest.length>20000)throw new Error("INPUT_TOO_LARGE");
  const sha=createHash("sha256").update(bytes).digest("hex");
  const provenance=validateReasoningManifest(JSON.parse(rawManifest),sha);
  const report=describeReasoningFormEvidence(parseReasoningCsv(bytes.toString("utf8")));
  process.stdout.write(JSON.stringify({provenance,report},null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{process.stderr.write("Reasoning audit blocked: "+e.message+"\n");process.exitCode=1;});
}
