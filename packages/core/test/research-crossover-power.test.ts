import {test} from "node:test";
import assert from "node:assert/strict";
import {simulateCrossoverPlanning,holmTwoContrasts,type CrossoverPlanningScenario} from "../src/research-crossover-power.ts";
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

test("Holm correction protects two planned tests at familywise 5% level",()=>{
  assert.deepEqual(holmTwoContrasts(2.1,2.0),{form:false,session:false});
  assert.deepEqual(holmTwoContrasts(2.6,1.1),{form:true,session:false});
  assert.deepEqual(holmTwoContrasts(2.5,2.1),{form:true,session:true});
  assert.deepEqual(holmTwoContrasts(1.9,2.6),{form:false,session:true});
  assert.deepEqual(holmTwoContrasts(2.5,2.5),{form:true,session:true});
  assert.throws(()=>holmTwoContrasts(NaN,2),/invalid/);
  assert.throws(()=>holmTwoContrasts(-1,2),/invalid/);
});
test("Holm-adjusted detection never exceeds nominal and null FWER is separately exposed",()=>{
  const x=simulateCrossoverPlanning({...standard,replicates:400});
  assert.equal(x.status,"planning_scenario_only");
  assert.ok(x.holmAdjustedFormDetectionRate!<=x.twoSidedFormDetectionRate!);
  assert.ok(x.holmAdjustedSessionDetectionRate!<=x.twoSidedSessionDetectionRate!);
  assert.ok(x.holmNullFormFalsePositiveRate!<=x.nullFormFalsePositiveRate!);
  assert.ok(x.holmNullSessionFalsePositiveRate!<=x.nullSessionFalsePositiveRate!);
  assert.ok(x.holmNullFamilywiseFalsePositiveRate!<=x.unadjustedNullFamilywiseFalsePositiveRate!);
  assert.ok(x.holmNullFamilywiseFalsePositiveRate!>=0&&x.holmNullFamilywiseFalsePositiveRate!<=1);
  const sparse=simulateCrossoverPlanning({...standard,assignedParticipants:80,
    dropoutAB:.7,dropoutBA:.7});
  assert.equal(sparse.holmNullFamilywiseFalsePositiveRate,null);
});
