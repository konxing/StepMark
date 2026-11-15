import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateTimeOnlyAutomaticityHoldout} from "../src/time-only-holdout.ts";
import type {AutomaticitySeriesRow} from "../src/validation.ts";
function series(count=20):AutomaticitySeriesRow[]{
  return Array.from({length:count},(_,i)=>
    Array.from({length:40},(_,day)=>({participantId:"person"+i,day,
      effectiveRepetitions:day,
      automaticity:10+1.7*day+(i%3)*.02
    }))).flat();
}
test("time-only model holds out future ratings and detects stable linear change",()=>{
  const result=evaluateTimeOnlyAutomaticityHoldout(series());
  assert.equal(result.quality.participants,20);
  assert.equal(result.quality.eligibleParticipants,20);
  assert.equal(result.quality.evaluatedRows,240);
  assert.equal(result.timeLinear.rmse,0);
  assert.ok(result.lastRating.rmse!>8);
  assert.ok(result.pairedTimeLinear.ci95!.low>0);
});
test("arbitrary future exposure counts never affect time-only predictions",()=>{
  const source=series(20);
  const first=evaluateTimeOnlyAutomaticityHoldout(source);
  const changed=source.map(r=>r.day>=28?{...r,effectiveRepetitions:1000000-r.day}:r);
  assert.deepEqual(evaluateTimeOnlyAutomaticityHoldout(changed),first);
});
test("held-out outcomes cannot influence fitted slope",()=>{
  const base=series(15);
  const positive=evaluateTimeOnlyAutomaticityHoldout(base);
  const changed=base.map(r=>r.day>=28?{...r,automaticity:0}:r);
  const lower=evaluateTimeOnlyAutomaticityHoldout(changed);
  assert.equal(positive.quality.evaluatedRows,lower.quality.evaluatedRows);
  assert.ok(lower.timeLinear.rmse!>positive.timeLinear.rmse!);
});
test("recorded missing values remain missing, not zero or fabricated dates",()=>{
  const raw=series(20).map(r=>
    r.day%11===0?{...r,automaticity:null}:r);
  const result=evaluateTimeOnlyAutomaticityHoldout(raw);
  assert.equal(result.quality.recordedMissingRows,80);
  assert.equal(result.quality.eligibleParticipants,20);
  assert.ok(result.timeLinear.rmse!==null);
});
test("duplicates and invalid respondent rows are rejected",()=>{
  const row=series(1)[0]!;
  assert.throws(()=>evaluateTimeOnlyAutomaticityHoldout([row,row]),/duplicate/);
  assert.throws(()=>evaluateTimeOnlyAutomaticityHoldout([{...row,automaticity:150}]),/invalid/);
  assert.throws(()=>evaluateTimeOnlyAutomaticityHoldout([{...row,day:-1}]),/invalid/);
  assert.throws(()=>evaluateTimeOnlyAutomaticityHoldout([{...row,participantId:"private name"}]),/invalid/);
  assert.throws(()=>evaluateTimeOnlyAutomaticityHoldout([]),/sample/);
});
