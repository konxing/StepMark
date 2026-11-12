import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateAutomaticitySeries} from "../src/validation.ts";
import {habitCurve} from "../src/habit.ts";
test("temporal holdout never reports training error as predictive accuracy",()=>{
  const rows=[];
  for(const [id,noise] of [["p1",0],["p2",1]] as const){
    for(let day=0;day<40;day++){
      const truth=habitCurve(day,{baseline:12,asymptote:82,rate:0.09}) + (day%2?noise:-noise);
      rows.push({participantId:id,day,effectiveRepetitions:day,automaticity:truth});
    }
  }
  const out=evaluateAutomaticitySeries(rows);
  assert.equal(out.quality.evaluatedParticipants,2);
  assert.equal(out.quality.curveEligibleParticipants,2);
  assert.equal(out.quality.predictedHoldoutRecords,24);
  assert.ok(out.asymptoticCurve.rmse!<out.matchedLastObservation.rmse!);
  assert.equal(out.status,"descriptive_out_of_time_comparison");
});
test("flat/declining curves don't justify a fabricated growth estimate",()=>{
  const rows=Array.from({length:30},(_,day)=>({
    participantId:"p01",day,effectiveRepetitions:day,automaticity:70
  }));
  const out=evaluateAutomaticitySeries(rows);
  assert.equal(out.quality.evaluatedParticipants,1);
  assert.equal(out.quality.curveEligibleParticipants,0);
  assert.equal(out.asymptoticCurve.rmse,null);
  assert.equal(out.lastObservation.rmse,0);
});
test("missing is not zero, and each person contributes equally",()=>{
  const rows=[
    ...Array.from({length:20},(_,day)=>({participantId:"p1",day,effectiveRepetitions:day,
      automaticity:day%5===0?null:day*2})),
    ...Array.from({length:30},(_,day)=>({participantId:"p2",day,effectiveRepetitions:day,
      automaticity:30+day}))
  ];
  const a=evaluateAutomaticitySeries(rows);
  assert.equal(a.quality.participants,2);
  assert.equal(a.quality.missingAutomaticity,4);
  assert.equal(a.quality.evaluatedParticipants,2);
});
test("duplicates, decreasing counts and invalid scales are rejected before scoring",()=>{
  const a={participantId:"p1",day:1,effectiveRepetitions:3,automaticity:50};
  assert.throws(()=>evaluateAutomaticitySeries([a,a]),/duplicate/);
  assert.throws(()=>evaluateAutomaticitySeries([a,{...a,day:2,effectiveRepetitions:2}]),/declining/);
  assert.throws(()=>evaluateAutomaticitySeries([{...a,automaticity:101}]),/invalid/);
  assert.throws(()=>evaluateAutomaticitySeries([{...a,participantId:"A name with spaces"}]),/identifying/);
});

test("independent linear trajectories outperform square-root and log over withheld time",()=>{
  const rows=Array.from({length:45},(_,day)=>({
    participantId:"linear01",day,effectiveRepetitions:day,automaticity:10+1.5*day
  }));
  const out=evaluateAutomaticitySeries(rows);
  assert.equal(out.methodVersion,"time-split-v2");
  assert.ok(out.trendCandidates.linear.rmse!<out.trendCandidates.square_root.rmse!);
  assert.ok(out.trendCandidates.linear.rmse!<out.trendCandidates.logarithmic.rmse!);
  assert.equal(out.trendCandidates.linear.participants,1);
});
test("decreasing automaticity need not be forced into an increasing asymptote",()=>{
  const rows=Array.from({length:36},(_,day)=>({
    participantId:"decay01",day,effectiveRepetitions:day,automaticity:90-1.4*day
  }));
  const out=evaluateAutomaticitySeries(rows);
  assert.ok(out.trendCandidates.linear.rmse!<1e-9);
  assert.equal(out.asymptoticCurve.rmse,null);
});
test("constant exposure means trend slopes cannot be invented",()=>{
  const rows=Array.from({length:35},(_,day)=>({
    participantId:"cue_absent",day,effectiveRepetitions:2,automaticity:20+(day%2)*2
  }));
  const out=evaluateAutomaticitySeries(rows);
  assert.equal(out.trendCandidates.linear.rmse,null);
  assert.equal(out.trendCandidates.square_root.rmse,null);
  assert.equal(out.trendCandidates.logarithmic.rmse,null);
});
