import {test} from "node:test";
import assert from "node:assert/strict";
import {
  describePublicReasoningEvidence,evaluateResearchReliableChange,
  type ObservedForm,type ResearchMeasurement,type ResearchLinkingAndChangeEvidence
} from "../src/measurement-evidence.ts";
const a:ObservedForm={code:"logic-a-v1",status:"completed",total:6,attempted:6,
  correct:3,completedAt:"2026-11-01T10:00:00.000Z",integrityStatus:"verified"};
const b:ObservedForm={code:"logic-b-v1",status:"completed",total:6,attempted:6,
  correct:6,completedAt:"2026-11-09T10:00:00.000Z",integrityStatus:"verified"};
test("public form performance can never be presented as theta, percentile or growth",()=>{
  const report=describePublicReasoningEvidence([a,b]);
  assert.equal(report.evidenceGrade,"E0");
  assert.equal(report.verifiedCompletedItems,12);
  assert.equal(report.rawComparison?.rawDifferencePoints,50);
  assert.deepEqual(report.ability,{status:"not_estimated",theta:null,
    standardError:null,measurementInterval95:null,populationPercentile:null,
    compositeAbility:null});
  assert.equal(report.change.status,"insufficient_evidence");
  assert.equal(report.change.mdc95,null);
  assert.ok(report.blockedBy.includes("FORM_EQUIVALENCE_UNVERIFIED"));
  assert.ok(report.blockedBy.includes("PUBLIC_ANSWERS_EXPOSED"));
  assert.equal(report.sourcePolicy.aiChatJudgements,"excluded_from_ability");
  assert.equal(report.sourcePolicy.habitCheckins,"excluded_from_ability");
});
test("partial forms do not leak provisional scoring through evidence summaries",()=>{
  const partial:ObservedForm={...a,status:"in_progress",attempted:3,correct:null,completedAt:null};
  const summary=describePublicReasoningEvidence([partial,{...b,status:"locked",attempted:0,
    correct:null,completedAt:null}]);
  assert.equal(summary.rawComparison,null);
  assert.equal(summary.observations[0]?.itemsCorrect,null);
  assert.equal(summary.observations[1]?.itemsCorrect,null);
  assert.ok(summary.blockedBy.includes("NO_COMPLETE_FORM"));
  assert.throws(()=>describePublicReasoningEvidence([{...partial,correct:2},b]));
  assert.throws(()=>describePublicReasoningEvidence([{...a,attempted:5},b]));
});
test("legacy item fingerprints are not counted as verified evidence",()=>{
  const report=describePublicReasoningEvidence([{...a,integrityStatus:"legacy_unverified"},b]);
  assert.equal(report.verifiedCompletedItems,6);
  assert.ok(report.blockedBy.includes("LEGACY_UNVERIFIED_ANSWERS"));
  assert.equal(report.observations[0]?.itemsCorrect,3);
});
const first:ResearchMeasurement={
  measuredAtMs:1000000,theta:0.15,standardError:0.1,itemCount:25,
  constructCode:"reasoning.logic",scaleVersion:"logic-1",
  calibrationVersion:"cal-1",formCode:"private-a"
};
const later:ResearchMeasurement={...first,
  measuredAtMs:1200000,theta:0.62,standardError:0.1,formCode:"private-b"};
const link:ResearchLinkingAndChangeEvidence={
  constructCode:"reasoning.logic",scaleVersion:"logic-1",calibrationVersion:"cal-1",
  sourceSha256:"a".repeat(64),linkedFormCodes:["private-a","private-b"],
  independentEquatingValidated:true,independentRetestValidated:true,
  longitudinalInvarianceValidated:true,independentPracticeModelValidated:true,
  independentErrorsJustified:true,calibrationHoldoutPeople:280,
  retestReliabilityLower95:0.85,
  expectedPracticeEffect:0.10,practiceEffectSE:0.03,linkingSE:0.02
};
test("research-only reliable change subtracts practice gain and propagates all SE",()=>{
  const x=evaluateResearchReliableChange(first,later,link,1);
  const se=Math.hypot(.1,.1,.03,.02);
  assert.equal(x.status,"model_detected_increase");
  assert.equal(x.evidenceScope,"research_only_no_production_release");
  assert.ok(Math.abs(x.practiceAdjustedDifference!-.37)<1e-12);
  assert.ok(Math.abs(x.differenceSE!-se)<1e-12);
  assert.ok(Math.abs(x.minimumDetectableChange!-se*1.959963984540054)<1e-12);
  assert.ok(x.intervalFamilywise95![0]>0);
  const adjusted=evaluateResearchReliableChange(first,later,{
    ...link,expectedPracticeEffect:0.30},1);
  assert.equal(adjusted.status,"insufficient_evidence");
  assert.equal(adjusted.reason,"CHANGE_WITHIN_MEASUREMENT_UNCERTAINTY");
  assert.equal(adjusted.difference,.47);
});
test("reliable-change eligibility blocks unlinked forms, old samples, unreliable studies",()=>{
  assert.equal(evaluateResearchReliableChange(first,later,null,1).reason,
    "NO_INDEPENDENT_LINKING_OR_RETEST_EVIDENCE");
  assert.equal(evaluateResearchReliableChange(first,later,{
    ...link,independentPracticeModelValidated:false},1).status,"insufficient_evidence");
  assert.equal(evaluateResearchReliableChange(first,later,{
    ...link,calibrationHoldoutPeople:50},1).status,"insufficient_evidence");
  assert.equal(evaluateResearchReliableChange(first,later,{
    ...link,retestReliabilityLower95:0.79},1).status,"insufficient_evidence");
  assert.equal(evaluateResearchReliableChange({...first,itemCount:6},later,link,1).status,
    "insufficient_evidence");
  assert.equal(evaluateResearchReliableChange(first,{...later,scaleVersion:"new-uncalibrated"},
    link,1).status,"insufficient_evidence");
  assert.equal(evaluateResearchReliableChange(first,{...later,measuredAtMs:first.measuredAtMs},
    link,1).status,"insufficient_evidence");
});
test("predeclared multi-endpoint familywise correction is more conservative",()=>{
  const one=evaluateResearchReliableChange(first,later,link,1);
  const six=evaluateResearchReliableChange(first,later,link,6);
  assert.ok(six.minimumDetectableChange!>one.minimumDetectableChange!);
  const small={...later,theta:0.57};
  assert.equal(evaluateResearchReliableChange(first,small,link,1).status,"model_detected_increase");
  assert.equal(evaluateResearchReliableChange(first,small,link,6).status,"insufficient_evidence");
  assert.throws(()=>evaluateResearchReliableChange(first,later,link,0));
  assert.throws(()=>evaluateResearchReliableChange(first,later,link,7));
  assert.throws(()=>evaluateResearchReliableChange(first,{...later,standardError:-1},link,1));
});
