import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {benchmarkHabitAppCsv} from "./validate-habitapp.mjs";
import {parseReasoningCsv,validateReasoningManifest,describeReasoningFormEvidence,
  assessExternalDatasetUse} from "./evaluate-reasoning.mjs";

const head="participant_id,form_code,task_order,skill_code,correct,study_day";
const skills=["conditional","conditional","evidence","evidence","quantitative","quantitative"];
function syntheticPeople(n,mode="balanced"){
  const rows=[head];
  for(let p=0;p<n;p++){
    const person="p_"+String(p).padStart(8,"0");
    for(const [form,day] of [["logic-a-v1","0"],["logic-b-v1","10"]]){
      for(let i=0;i<6;i++){
        const answer=mode==="easier-b"? (form==="logic-b-v1"?"1":"0"):
          String((p+i)%2);
        rows.push([person,form,i+1,skills[i],answer,day].join(","));
      }
    }
  }
  return rows.join("\n");
}
const csv=syntheticPeople(24);
const hash=createHash("sha256").update(csv).digest("hex");
const manifest={datasetKind:"stepmark-consented-item-responses",
  purpose:"descriptive-independent-form-audit",participantIdsPseudonymous:true,
  explicitResearchConsentConfirmed:true,rightsReviewed:true,
  sourceVersion:"v1",citation:"Synthetic form data for parser test",
  sourceUrl:"https://example.org/synthetic-only",sha256:hash};

test("previous HabitApp dataset is useful for behavior, NOT logic form calibration",()=>{
  const oldFixture=[
    "subID,group,manipulation,time,n_entries",
    "101,short_training,devaluation,post,2",
    "101,short_training,still_valued,post,9"
  ].join("\n");
  assert.equal(benchmarkHabitAppCsv(oldFixture).participantCount,1);
  assert.throws(()=>parseReasoningCsv(oldFixture),/INCOMPATIBLE_SCHEMA/);
  assert.equal(assessExternalDatasetUse("habitapp-behavior-counts",
    "habit-behavior-description").eligible,true);
  assert.equal(assessExternalDatasetUse("habitapp-behavior-counts",
    "stepmark-logic-form-calibration").eligible,false);
  assert.equal(assessExternalDatasetUse("pisa-cognitive-items",
    "stepmark-logic-form-calibration").eligible,false);
  assert.equal(assessExternalDatasetUse("piaac-cognitive-items",
    "external-item-methods").eligible,false); // no file/codebook reviewed
});

test("checksum, explicit consent, independent scope and pseudonyms are mandatory",()=>{
  assert.equal(validateReasoningManifest(manifest,hash).sha256,hash);
  assert.throws(()=>validateReasoningManifest({...manifest,sha256:"0".repeat(64)},hash),/UNVERIFIED/);
  assert.throws(()=>validateReasoningManifest({...manifest,explicitResearchConsentConfirmed:false},hash),/UNVERIFIED/);
  assert.throws(()=>validateReasoningManifest({...manifest,datasetKind:"habitapp-behavior-counts"},hash),/UNVERIFIED/);
  assert.throws(()=>validateReasoningManifest({...manifest,participantIdsPseudonymous:false},hash),/UNVERIFIED/);
});
test("only complete, temporally separated matched forms yield descriptive summary",()=>{
  const result=describeReasoningFormEvidence(parseReasoningCsv(csv));
  assert.equal(result.population.matchedPeople,24);
  assert.equal(result.summary.pairedRawDifferencePoints,0);
  assert.equal(result.domains.length,3);
  assert.equal(result.status,"descriptive_unlinked_forms_only");
});
test("score increases from easier B items do NOT establish skill growth",()=>{
  const report=describeReasoningFormEvidence(parseReasoningCsv(syntheticPeople(30,"easier-b")));
  assert.equal(report.summary.pairedRawDifferencePoints,100);
  assert.match(report.interpretation,/NOT validated improvement/);
});
test("reject duplicates, mislabelled skills, short retest gaps and tiny study",()=>{
  const dup=csv+"\n"+csv.split("\n")[1];
  assert.throws(()=>parseReasoningCsv(dup),/DUPLICATE/);
  assert.throws(()=>parseReasoningCsv(csv.replace("p_00000000","person:name")),/INVALID_REASONING_ROW/);
  assert.throws(()=>parseReasoningCsv(csv.replace("conditional,0,0","quantitative,0,0")),/INVALID_REASONING_ROW/);
  const early=csv.replaceAll(",logic-b-v1,",",logic-b-v1,").replaceAll(",10\n",",3\n");
  const allEarly=early.endsWith(",10")?early.slice(0,-2)+"3":early;
  assert.throws(()=>describeReasoningFormEvidence(parseReasoningCsv(allEarly)),/INSUFFICIENT_MATCHED/);
  assert.throws(()=>describeReasoningFormEvidence(parseReasoningCsv(syntheticPeople(4))),/INSUFFICIENT_MATCHED/);
});
