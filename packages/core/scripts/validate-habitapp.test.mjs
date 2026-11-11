import {test} from "node:test";
import assert from "node:assert/strict";
import {benchmarkHabitAppCsv,gitBlobSha} from "./validate-habitapp.mjs";
const fixture=[
 "subID,group,manipulation,time,n_entries",
 "101,short_training,devaluation,post,2",
 "101,short_training,still_valued,post,9",
 "102,short_training,devaluation,post,7",
 "102,short_training,still_valued,post,3",
 "103,long_training,devaluation,post,0",
 "103,long_training,still_valued,post,4"
].join("\n");
test("public-data benchmark pairs by person and condition, never raw global totals",()=>{
 const r=benchmarkHabitAppCsv(fixture);
 assert.equal(r.rowCount,6);
 assert.equal(r.participantCount,3);
 assert.equal(r.pairedParticipantCount,3);
 assert.equal(r.groups.length,2);
 assert.ok(r.groups.every(g=>g.pairedParticipants>0));
});
test("bad schemas, tampering and duplicate participant-condition values fail closed",()=>{
 assert.throws(()=>benchmarkHabitAppCsv(fixture,{verifyPinned:true}),/SOURCE_HASH_MISMATCH/);
 assert.throws(()=>benchmarkHabitAppCsv(fixture.replace("subID","person")),/INVALID_SCHEMA/);
 assert.throws(()=>benchmarkHabitAppCsv(fixture+"\n101,short_training,devaluation,post,2"),/DUPLICATE_OBSERVATION/);
 assert.throws(()=>benchmarkHabitAppCsv(fixture.replace("post,9","post,-1")),/INVALID_VALUE/);
 assert.match(gitBlobSha(Buffer.from("hello")),/^[a-f0-9]{40}$/);
});
