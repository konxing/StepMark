import {test} from "node:test";
import assert from "node:assert/strict";
import {auditResolvedForecasts,type ResolvedForecastEvidence} from "../src/forecast-calibration-audit.ts";
const sample=(id:string,p:number,ref:number,y:0|1):ResolvedForecastEvidence=>({
  eventKey:id,forecastProbability:p,referenceProbability:ref,outcome:y,
  referenceAtMs:1000,forecastAtMs:1500,resolvedAtMs:2000
});
const options={referencePolicyVersion:"baseline-fixed-v1",nowMs:3000};
test("proper scoring distinguishes evidence from chance and reports fixed bins",()=>{
  const items=Array.from({length:40},(_,i)=>sample("item"+i,i%2===0?.8:.2,.5,i%2===0?1:0));
  const r=auditResolvedForecasts(items,options);
  assert.equal(r.status,"descriptive_only");
  assert.equal(r.eventCount,40);
  assert.equal(r.brier,.04);
  assert.equal(r.referenceBrier,.25);
  assert.equal(r.brierSkill,.84);
  assert.equal(r.calibrationGap,.2);
  assert.equal(r.bins.reduce((n,b)=>n+b.count,0),40);
  assert.equal(r.bins[1]?.count,20);
  assert.equal(r.bins[4]?.count,20);
  assert.ok(r.logLoss!>0);
  assert.ok(r.logLoss!<r.referenceLogLoss!);
  assert.equal(r.timeSplit,null);
});
test("small samples cannot be promoted to calibrated ability",()=>{
  const r=auditResolvedForecasts([sample("a",1,1,1)],options);
  assert.equal(r.status,"insufficient_evidence");
  assert.equal(r.brierSkill,null);
  assert.equal(r.calibrationGap,null);
  assert.equal(r.logLoss,0);
  assert.equal(r.bins.filter(x=>x.count).length,1);
});
test("certainty contradictions remain visible rather than clipped away",()=>{
  const r=auditResolvedForecasts([sample("a",0,1,1),sample("b",1,0,1)],options);
  assert.equal(r.logLoss,null);
  assert.equal(r.referenceLogLoss,null);
  assert.equal(r.infiniteLogLossEvents,1);
  assert.equal(r.infiniteReferenceLogLossEvents,1);
  assert.equal(r.brier,.5);
  assert.equal(r.brierSkill,0);
});
test("timestamp cutoff is defined by forecast time not hindsight resolution",()=>{
  const early=sample("early",.2,.5,0),late={...sample("later",.8,.5,1),forecastAtMs:1800};
  const r=auditResolvedForecasts([early,late],{...options,timeSplitAtMs:1700});
  assert.equal(r.timeSplit?.earlier.events,1);
  assert.equal(r.timeSplit?.later.events,1);
  assert.equal(r.timeSplit?.earlier.brier,.04);
  assert.equal(r.timeSplit?.later.brier,.04);
});
test("reject duplicate events, future results, replaced baselines and malformed scores",()=>{
  const a=sample("a",.7,.5,1);
  for(const items of [[a,a],[{...a,referenceAtMs:1600}],
    [{...a,forecastAtMs:2500}],[{...a,resolvedAtMs:4000}],
    [{...a,forecastProbability:NaN}],[{...a,forecastProbability:1.1}],
    [{...a,outcome:2 as 0|1}],[{...a,eventKey:"Alice private diary"}]]){
    assert.throws(()=>auditResolvedForecasts(items,options),/invalid|duplicated|hindsight/);
  }
  assert.throws(()=>auditResolvedForecasts([] ,options),/configuration/);
  assert.throws(()=>auditResolvedForecasts([a],{...options,referencePolicyVersion:""}),/configuration/);
});
