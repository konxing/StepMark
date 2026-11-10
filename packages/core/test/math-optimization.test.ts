import {test} from "node:test";
import assert from "node:assert/strict";
import {adherencePosterior,estimateThetaEap,selectNextCalibratedItem,filterLongitudinal} from "../src/index.ts";
const version="research-calibration-1";
const item=(id:string,difficulty:number,expectedSeconds=30,contentArea="logic",exposureRate=0.1) => ({
  id,calibrationStatus:"validated" as const,calibrationVersion:version,
  discrimination:1.5,difficulty,contentArea,expectedSeconds,exposureRate
});
test("Bayesian smoothing is explicit, never invents data and contracts uncertainty",()=>{
  assert.equal(adherencePosterior(0,0),null);
  const sparse=adherencePosterior(1,1)!;
  assert.equal(sparse.observedRate,1);
  assert.ok(sparse.posteriorMean<1 && sparse.posteriorMean>0.5);
  assert.ok(adherencePosterior(80,100)!.posteriorSD<sparse.posteriorSD);
  assert.throws(()=>adherencePosterior(2,1));
  assert.throws(()=>adherencePosterior(1,1,{alpha:0,beta:1}));
});
test("EAP shrinks uncertainty and respects monotonic item evidence",()=>{
  const none=estimateThetaEap([],version);
  const correct=estimateThetaEap([{item:item("q1",0),correct:true}],version);
  const wrong=estimateThetaEap([{item:item("q1",0),correct:false}],version);
  assert.ok(Math.abs(none.theta)<1e-10);
  assert.ok(correct.theta>0 && wrong.theta<0);
  assert.ok(correct.standardError<none.standardError);
  assert.throws(()=>estimateThetaEap([{item:item("q1",0),correct:true},{item:item("q1",0),correct:false}],version));
  assert.throws(()=>estimateThetaEap([{item:{...item("u",0),calibrationStatus:"unverified" as "validated"},correct:true}],version));
});
test("Adaptive next item maximizes expected variance reduction / time when content unconstrained",()=>{
  const r=selectNextCalibratedItem({answers:[],candidates:[
    item("hard",3,15),item("close",0,20),item("too-slow",0,200)
  ],calibrationVersion:version,minItems:3});
  assert.equal(r?.itemId,"close");
  assert.ok(r!.expectedVarianceReduction>0);
});
test("Adaptive selection enforces exposures, content shares, used IDs and scale version",()=>{
  const ans=[{item:item("used",0),correct:true}];
  const result=selectNextCalibratedItem({answers:ans,candidates:[
    item("used",0),item("too-exposed",0,10,"logic",0.9),
    item("logic2",0,20,"logic",0.1),item("language",1,80,"language",0.1)
  ],calibrationVersion:version,maxExposureRate:0.5,completedByContent:{logic:3,language:0},
  targetShare:{logic:0.5,language:0.5}});
  assert.equal(result?.itemId,"language");
  assert.throws(()=>selectNextCalibratedItem({answers:[],candidates:[{...item("a",0),calibrationVersion:"other"}],calibrationVersion:version}));
});
test("Kalman filter respects uncertainty, time gaps and scale comparability",()=>{
  const day=86400000;
  const cfg={scaleVersion:"formA",priorMean:50,priorVariance:100,processVariancePerDay:0.2};
  const r=filterLongitudinal([
    {measuredAtMs:0,score:60,standardError:4,scaleVersion:"formA",comparable:true},
    {measuredAtMs:3*day,score:59,standardError:15,scaleVersion:"formA",comparable:true},
    {measuredAtMs:30*day,score:64,standardError:3,scaleVersion:"formA",comparable:true},
  ],cfg)!;
  assert.equal(r.points.length,3);
  assert.ok(r.points[0]!.mean>50 && r.points[0]!.mean<60);
  assert.ok(Math.abs(r.points[1]!.mean-r.points[0]!.mean)<1);
  assert.ok(r.points[2]!.mean>r.points[1]!.mean);
  assert.throws(()=>filterLongitudinal([{measuredAtMs:0,score:50,standardError:3,scaleVersion:"formB",comparable:true}],cfg));
  assert.equal(filterLongitudinal([],cfg),null);
});
