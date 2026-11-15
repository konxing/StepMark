import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePinnedMarsShortformCsv,verifyGitBlob} from "./validate-mars-item-quality.mjs";
const header="subject,trial,item_set,short_form,item_id,item,distractor,shape_set,choice,accuracy,rt,all_loaded,minimum_resolution,browser_interactions";
const row="p01,1,1,2,101,10,pd,1,0.0,1.0,14.3,1,1,0.0";
const missing="p02,2,1,2,102,11,md,2,0.0,NA,NA,1,1,0.0";
const buffer=Buffer.from(header+"\n"+row+"\n"+missing+"\n");
test("pinned source schema parses distinct observed and missing",()=>{
  const result=parsePinnedMarsShortformCsv(buffer);
  assert.equal(result.length,2);
  assert.equal(result[0].correct,1);
  assert.equal(result[0].responseTimeMs,14300);
  assert.equal(result[1].correct,null);
  assert.equal(result[1].responseTimeMs,null);
  assert.equal(result[0].formKey,"mars-short-2");
});
test("fails on shifted schema, IDs, implausible latency, and changed upstream bytes",()=>{
  assert.throws(()=>parsePinnedMarsShortformCsv(Buffer.from(header.replace("subject","sUbject")+"\n"+row)),/SCHEMA/);
  assert.throws(()=>parsePinnedMarsShortformCsv(Buffer.from(header+"\n"+
    row.replace("p01","a private name"))),/INVALID/);
  assert.throws(()=>parsePinnedMarsShortformCsv(Buffer.from(header+"\n"+
    row.replace("14.3","-5"))),/INVALID/);
  assert.throws(()=>verifyGitBlob(buffer),/VERSION_MISMATCH/);
});
