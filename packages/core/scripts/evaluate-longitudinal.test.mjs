import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {parseStudyCsv,checkStudyRights} from "./evaluate-longitudinal.mjs";
const csv="participant_id,day,effective_repetitions,automaticity_0_100\na1,0,0,\na1,1,1,35.6\na1,2,1,40";
const hash=createHash("sha256").update(csv).digest("hex");
const manifest={reusePermissionConfirmed:true,license:"CC-BY-4.0",citation:"Example author and study",
  sourceUrl:"https://example.org/verified-record",sourceVersion:"v1",
  automaticityMeasure:"independent SRBAI derived measure",automaticityIndependentOfPredictions:true,
  sha256:hash};
test("typed CSV distinguishes missing from zero; no private identifiers emitted",()=>{
 const rows=parseStudyCsv(csv);
 assert.equal(rows.length,3);
 assert.equal(rows[0].automaticity,null);
 assert.equal(rows[1].automaticity,35.6);
 assert.throws(()=>parseStudyCsv(csv+"\na1,3,2,500"),/INVALID_STUDY_ROW/);
});
test("unverified rights and mismatched checksums are rejected",()=>{
 assert.equal(checkStudyRights(manifest,hash).sha256,hash);
 assert.throws(()=>checkStudyRights({...manifest,reusePermissionConfirmed:false},hash),/UNVERIFIED/);
 assert.throws(()=>checkStudyRights({...manifest,automaticityIndependentOfPredictions:false},hash),/AUTOMATICITY_TARGET/);
 assert.throws(()=>checkStudyRights(manifest,"0".repeat(64)),/UNVERIFIED/);
});
