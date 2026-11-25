import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {evidenceMetrics,classificationMetrics,pairedCases,exactDecision,decision} from "./measurement-metrics";
import {workExamples,commandExamples,habitExamples} from "./measurement-cases";
import {challengeCases} from "./measurement-challenge-cases";
import {authorizeAssistantCommand} from "../src/server/assistant-command";
import {validateHabitAnnotation} from "../src/server/habit-ai";

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

test("the 30 challenge cases leave the original 49-case dataset unchanged",()=>{
  const original=JSON.stringify({workExamples,habitExamples,commandExamples});
  assert.equal(createHash("sha256").update(original).digest("hex"),
    "32259dcc8b484b917b79ec30005b1b10ff838c3d015614aecebe71250dd511f0");
  for(const set of [challengeCases.workExamples,challengeCases.habitExamples,challengeCases.commandExamples]){
    assert.equal(set.length,10);
    assert.equal(new Set(set.map(example=>example.id)).size,set.length);
  }
});

test("multiple actions must each match and receive their own result",()=>{
  const example=challengeCases.workExamples.find(row=>row.id==="separate-actions")!;
  const [first,second]=example.fixture;
  assert(first&&second);
  assert.equal(evidenceMetrics([example],[[second,first]]).exactCaseAccuracy,1);
  const missing=evidenceMetrics([example],[[first]]);
  assert.equal(missing.missedActions,1);
  assert.equal(missing.missedResults,1);
  const mixed=evidenceMetrics([example],[[{...first,outcomeQuote:second.outcomeQuote},
    {...second,outcomeQuote:first.outcomeQuote}]]);
  assert.equal(mixed.correctActions,2);
  assert.equal(mixed.correctResults,0);
  assert.equal(mixed.exactCaseAccuracy,0);
});

test("challenge diary fixtures preserve levels and reject evidence from completed or borrowed actions",()=>{
  for(const example of challengeCases.habitExamples){
    const proposal={initiationLevel:example.expected??4,confidence:0.95,quote:example.note};
    assert.equal(validateHabitAnnotation(proposal,example.note,"fixture").level,example.expected,example.id);
  }
});

test("challenge command fixtures preserve intended actions and reject ambiguous writes",()=>{
  for(const example of challengeCases.commandExamples){
    const {expected}=example;
    const proposal={intent:expected.kind==="progress"?"check_progress":"record_opportunity",
      habitId:expected.kind==="opportunity"||expected.kind==="progress"?expected.habitId:example.habits[0]!.id,
      title:null,action:null,cue:null,status:expected.kind==="opportunity"?expected.status:"done",
      when:expected.kind==="opportunity"?expected.when:"today",initiationLevel:null,confidence:0.95,
      quote:null,reply:"Fixture"};
    assert.deepEqual(decision(authorizeAssistantCommand(proposal,example.message,example.habits)),expected,example.id);
  }
});
