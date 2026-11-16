import {test} from "node:test";
import assert from "node:assert/strict";
import {simulateCrossoverPlanning,type CrossoverPlanningScenario} from "../src/research-crossover-power.ts";
const standard:CrossoverPlanningScenario={
  assignedParticipants:240,itemsPerForm:12,formLogitShift:.35,
  secondSessionLogitShift:.3,dropoutAB:.12,dropoutBA:.12,
  replicates:140,seed:20261117
};
test("fixed simulated crossover is deterministic and returns conditional rates",()=>{
  const a=simulateCrossoverPlanning(standard);
  assert.deepEqual(a,simulateCrossoverPlanning(standard));
  assert.equal(a.kind,"synthetic_counterbalanced_planning_v1");
  assert.equal(a.status,"planning_scenario_only");
  assert.equal(a.eligibleEffectReplicates,standard.replicates);
  assert.equal(a.eligibleNullReplicates,standard.replicates);
  for(const key of ["twoSidedFormDetectionRate","twoSidedSessionDetectionRate",
      "nullFormFalsePositiveRate","nullSessionFalsePositiveRate"] as const){
    assert.ok(a[key]!==null&&a[key]!>=0&&a[key]!<=1);
  }
});
test("a strong scenario is easier to detect than an exactly null scenario",()=>{
  const a=simulateCrossoverPlanning({...standard,formLogitShift:1,secondSessionLogitShift:1});
  assert.ok(a.twoSidedFormDetectionRate!==null&&a.twoSidedFormDetectionRate>.8);
  assert.ok(a.twoSidedSessionDetectionRate!==null&&a.twoSidedSessionDetectionRate>.8);
  const nullEffect=simulateCrossoverPlanning({...standard,formLogitShift:0,secondSessionLogitShift:0});
  assert.ok(nullEffect.twoSidedFormDetectionRate!==null&&nullEffect.twoSidedFormDetectionRate<.2);
  assert.ok(nullEffect.twoSidedSessionDetectionRate!==null&&nullEffect.twoSidedSessionDetectionRate<.2);
});
test("severe dropout prevents confident sample-size claims",()=>{
  const result=simulateCrossoverPlanning({
    ...standard,assignedParticipants:80,dropoutAB:.7,dropoutBA:.7
  });
  assert.equal(result.status,"insufficient_simulated_pairs");
  assert.equal(result.twoSidedFormDetectionRate,null);
  assert.equal(result.nullFormFalsePositiveRate,null);
});
test("invalid assumptions fail closed",()=>{
  for(const scenario of [
    {...standard,assignedParticipants:81},
    {...standard,itemsPerForm:2},
    {...standard,replicates:5},
    {...standard,dropoutAB:-.1},
    {...standard,dropoutBA:.85},
    {...standard,seed:0},
    {...standard,formLogitShift:Infinity}
  ]) assert.throws(()=>simulateCrossoverPlanning(scenario),/assumptions/);
});
