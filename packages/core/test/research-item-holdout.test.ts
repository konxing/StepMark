import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateHeldoutItemRates} from "../src/research-item-holdout.ts";
import type {RecordedItemResponse} from "../src/item-quality-audit.ts";
function cohort(n:number):RecordedItemResponse[] {
  const rows:RecordedItemResponse[]=[];
  for(let k=0;k<n;k++)for(let j=0;j<8;j++){
    const y=j<4?(k%10===0?0:1):(k%10===0?1:0);
    rows.push({personKey:"p"+k,formKey:"A",itemKey:"i"+j,
      correct:y as 0|1});
  }
  return rows;
}
test("fixed respondent holdout compares item and global rates on identical targets",()=>{
  const result=evaluateHeldoutItemRates(cohort(250));
  const a=result.forms[0]!;
  assert.equal(a.status,"descriptive_only");
  assert.equal(a.peopleWithRows,250);
  assert.equal(a.trainAnswers+a.testAnswers,2000);
  assert.ok(a.testPeople>=20);
  assert.ok(a.itemRateBrier!==null&&a.formRateBrier!==null&&a.itemRateBrier<a.formRateBrier);
  assert.ok(a.pairedBootstrap95!==null&&a.pairedBootstrap95[0]>0);
  assert.deepEqual(evaluateHeldoutItemRates(cohort(250).reverse()),result);
});
test("explicit missing rows are never interpreted as negative responses",()=>{
  const data=cohort(250);
  const masked=data.map(row=>row.itemKey==="i3"&&Number(row.personKey.slice(1))%7===0?
    {...row,correct:null}:row);
  const result=evaluateHeldoutItemRates(masked).forms[0]!;
  assert.equal(result.recordedMissing,36);
  assert.equal(result.trainAnswers+result.testAnswers+result.recordedMissing,2000);
});
test("source item and form grouping never pool the same item IDs",()=>{
  const a=cohort(220);
  const b=a.map(x=>({...x,formKey:"B",correct:(1-x.correct!) as 0|1}));
  const result=evaluateHeldoutItemRates([...a,...b]);
  assert.equal(result.forms.length,2);
  assert.equal(result.forms[0]?.formKey,"A");
  assert.equal(result.forms[1]?.formKey,"B");
  assert.ok(result.forms[0]!.itemRateBrier!==null);
});
test("insufficient data is null, not an apparently precise positive result",()=>{
  const result=evaluateHeldoutItemRates(cohort(35)).forms[0]!;
  assert.equal(result.status,"insufficient_evidence");
  assert.equal(result.improvementBrier,null);
  assert.equal(result.pairedBootstrap95,null);
});
test("invalid and duplicate person-form-item responses fail closed",()=>{
  const a=cohort(40),v=a[0]!;
  assert.throws(()=>evaluateHeldoutItemRates([...a,v]),/duplicate/);
  assert.throws(()=>evaluateHeldoutItemRates([{...v,correct:2 as 0|1}]),/invalid/);
  assert.throws(()=>evaluateHeldoutItemRates([{...v,personKey:"unbounded personal name"}]),/invalid/);
  assert.throws(()=>evaluateHeldoutItemRates([]),/size/);
});
