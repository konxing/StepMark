import {test} from "node:test";
import assert from "node:assert/strict";
import {auditCounterbalancedCrossover,type RecordedCrossoverForm} from "../src/research-form-crossover.ts";
const DAY=86400000;
function sample(n=160):RecordedCrossoverForm[]{
  const rows:RecordedCrossoverForm[]=[];
  for(let i=0;i<n;i++){
    const sequence=i%2===0?"A_B":"B_A";
    const personKey="p"+i,first=sequence==="A_B"?"A":"B";
    const forms=(sequence==="A_B"?["A","B"]:["B","A"]) as ("A"|"B")[];
    for(let index=0;index<2;index++){
      const form=forms[index]!;
      const correctItems=form==="A"?5:sequence==="A_B"?7:6;
      rows.push({personKey,form,assignedSequence:sequence,
        formVersion:form==="A"?"logic-a-exp-v2":"logic-b-exp-v2",
        correctItems,totalItems:10,
        sessionAtMs:DAY*(20000+index*7)});
    }
    assert.equal(forms[0],first);
  }
  return rows;
}
test("crossed-order model separates source-form and second-session contrasts",()=>{
  const r=auditCounterbalancedCrossover(sample());
  assert.equal(r.status,"descriptive_only");
  assert.equal(r.completeAB,80);
  assert.equal(r.completeBA,80);
  assert.deepEqual(r.meanRawBMinusA,{AB:0.2,BA:0.1});
  assert.equal(r.formContrast,0.15);
  assert.equal(r.secondSessionContrast,0.05);
  assert.deepEqual(r.formContrastBootstrap95,[0.15,0.15]);
  assert.deepEqual(r.secondSessionBootstrap95,[0.05,0.05]);
  assert.deepEqual(r.medianDaysBetweenSessions,{AB:7,BA:7});
  assert.deepEqual(auditCounterbalancedCrossover(sample().reverse()),r);
});
test("one-sequence design does not claim a paired-equating estimate",()=>{
  const onlyAB=sample(120).filter(x=>x.assignedSequence==="A_B");
  const r=auditCounterbalancedCrossover(onlyAB);
  assert.equal(r.status,"insufficient_evidence");
  assert.equal(r.formContrast,null);
  assert.equal(r.secondSessionContrast,null);
});
test("missing second sessions remain visible and gate excessive attrition",()=>{
  const data=sample(160);
  const reduced=data.filter(x=>Number(x.personKey.slice(1))>=50||x.form==="A");
  const r=auditCounterbalancedCrossover(reduced);
  assert.ok(r.incompletePairs>20);
  assert.equal(r.status,"insufficient_evidence");
  assert.equal(r.formContrast,null);
});
test("mismatched forms, dates, scoring, identifiers and duplicate submissions are rejected",()=>{
  const data=sample(120),one=data[0]!;
  const invalid:RecordedCrossoverForm[]=[
    {...one,correctItems:11},
    {...one,totalItems:0},
    {...one,sessionAtMs:NaN},
    {...one,personKey:"private name"}
  ];
  for(const x of invalid)assert.throws(()=>auditCounterbalancedCrossover([x]),/invalid/);
  assert.throws(()=>auditCounterbalancedCrossover([...data,one]),/duplicate/);
  const mismatch=data.map((r,i)=>i===2?{...r,formVersion:"modified-form"}:r);
  assert.throws(()=>auditCounterbalancedCrossover(mismatch),/inconsistent/);
  const misorder=data.map((r,i)=>i===0?{...r,sessionAtMs:r.sessionAtMs+30*DAY}:r);
  assert.throws(()=>auditCounterbalancedCrossover(misorder),/order/);
});
