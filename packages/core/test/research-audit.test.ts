import {test} from "node:test";
import assert from "node:assert/strict";
import {pairedRmseBootstrap,auditRecordedMissingness} from "../src/research-audit.ts";
import {evaluateAutomaticitySeries} from "../src/validation.ts";

test("matched-person cluster resampling is deterministic and detects clear improvement",()=>{
  const pairs=Array.from({length:20},(_,i)=>({
    baseline:[10+(i%3),-8,-5],
    candidate:[1+(i%3),-2,-1]
  }));
  const a=pairedRmseBootstrap(pairs,{iterations:400,seed:93});
  const b=pairedRmseBootstrap(pairs,{iterations:400,seed:93});
  assert.deepEqual(a,b);
  assert.equal(a.participants,20);
  assert.ok(a.improvement!>0);
  assert.ok(a.ci95!.low>0);
  const inverted=pairedRmseBootstrap(pairs.map(p=>({baseline:p.candidate,candidate:p.baseline})),{iterations:400,seed:93});
  assert.ok(inverted.ci95!.high<0);
});

test("bootstrap refuses mismatched, missing and unbounded errors; small cohorts have no CI",()=>{
  assert.throws(()=>pairedRmseBootstrap([{baseline:[1],candidate:[1,2]}]),/matched/);
  assert.throws(()=>pairedRmseBootstrap([{baseline:[Infinity],candidate:[0]}]),/finite/);
  const a=pairedRmseBootstrap([{baseline:[2],candidate:[1]}]);
  assert.equal(a.ci95,null);
  assert.equal(a.status,"insufficient");
  assert.equal(pairedRmseBootstrap([]).improvement,null);
  assert.throws(()=>pairedRmseBootstrap([],{iterations:10}),/configuration/);
});

test("missingness audit measures recorded NA only, not silent calendar gaps",()=>{
  const data=[
    {participantId:"a",day:0,automaticity:20},
    {participantId:"a",day:10,automaticity:null},
    {participantId:"a",day:20,automaticity:30},
    {participantId:"a",day:40,automaticity:null},
    {participantId:"b",day:0,automaticity:55},
    {participantId:"b",day:5,automaticity:60}
  ];
  const a=auditRecordedMissingness(data);
  assert.equal(a.participants,2);
  assert.equal(a.earlyRecordedRows,3);
  assert.equal(a.lateRecordedRows,3);
  assert.equal(a.earlyMissing,1);
  assert.equal(a.lateMissing,1);
  assert.equal(a.participantsWithRecordedMissing,1);
  assert.equal(a.scope,"recorded_study_rows_only");
});

test("formation evaluation exposes paired CI and does not count NA as failures",()=>{
  const rows=Array.from({length:16},(_,i)=>Array.from({length:30},(_,day)=>({
    participantId:"p"+i,day,effectiveRepetitions:day,
    automaticity:day%10===0?null:Math.min(100,10+3*day+(i%3))
  }))).flat();
  const r=evaluateAutomaticitySeries(rows);
  assert.equal(r.quality.participants,16);
  assert.equal(r.recordedMissingness.participants,16);
  assert.equal(r.recordedMissingness.earlyMissing>0,true);
  assert.equal(r.pairedTrends.linear.participants,16);
  assert.ok(r.pairedTrends.linear.ci95!==null);
  assert.equal(r.pairedTrends.linear.candidateRmse,r.trendCandidates.linear.rmse);
});
