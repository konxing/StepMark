import {test} from "node:test";
import assert from "node:assert/strict";
import {evidenceMetrics,classificationMetrics,pairedCases,exactDecision,decision} from "./measurement-metrics";
import {workExamples,commandExamples,habitExamples} from "./measurement-cases";
import {authorizeAssistantCommand} from "../src/server/assistant-command";

test("duplicate records lower precision, missing records lower recall, empty output is not a winning baseline",()=>{
  const example=workExamples[0]!;
  const exact=evidenceMetrics([example],[[example.expected]]);
  assert.equal(exact.actionPrecision,1);assert.equal(exact.actionRecall,1);
  const duplicate=evidenceMetrics([example],[[example.expected,example.expected]]);
  assert.equal(duplicate.actionPrecision,0.5);assert.equal(duplicate.falseActions,1);
  assert.equal(duplicate.exactCaseAccuracy,0);
  const empty=evidenceMetrics([example],[[]]);
  assert.equal(empty.actionPrecision,null);assert.equal(empty.actionRecall,0);assert.equal(empty.actionF1,0);
  assert.throws(()=>evidenceMetrics([example],[]),/EVALUATION_LENGTH_MISMATCH/);
});

test("network failures cannot be counted as correctly abstaining on negative cases",()=>{
  const negative=workExamples.find(row=>row.expected===null)!;
  assert.equal(evidenceMetrics([negative],[[]],[true]).exactCaseAccuracy,1);
  assert.equal(evidenceMetrics([negative],[[]],[false]).exactCaseAccuracy,0);
  const missing=classificationMetrics([{id:"missing-reply",correct:false,falsePositive:false,falseNegative:false}]);
  assert.equal(missing.accuracy,0);
});

test("pairing refuses a changed sample order, and records losses as well as wins",()=>{
  const before=[{id:"a",correct:false},{id:"b",correct:true},{id:"c",correct:true}];
  const after=[{id:"a",correct:true},{id:"b",correct:false},{id:"c",correct:true}];
  assert.deepEqual(pairedCases(before,after),{wins:1,ties:1,losses:1,accuracyDifferencePoints:0});
  assert.throws(()=>pairedCases(before,[after[1]!,after[0]!,after[2]!]),/EVALUATION_PAIR_MISMATCH/);
});

test("synthetic benchmark covers all current suites without production IDs or sensitive data",()=>{
  assert.equal(workExamples.length,20);assert.equal(habitExamples.length,14);assert.equal(commandExamples.length,15);
  for(const suite of [workExamples,habitExamples,commandExamples])assert.equal(new Set(suite.map(x=>x.id)).size,suite.length);
  const source=JSON.stringify([workExamples,habitExamples,commandExamples]);
  assert(!/sk-[a-zA-Z0-9_-]{12,}|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(source));
});

test("a wrong habit, status or day is not a correct action even if its intent matches",()=>{
  const expected={kind:"opportunity",habitId:"one",status:"done",when:"today"} as const;
  assert(!exactDecision(expected,{...expected,habitId:"two"}));
  assert(!exactDecision(expected,{...expected,when:"yesterday"}));
  assert(!exactDecision(expected,{...expected,status:"missed"}));
});
