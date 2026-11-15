import {test} from "node:test";
import assert from "node:assert/strict";
import {auditRecordedBinaryItems,type RecordedItemResponse} from "../src/item-quality-audit.ts";
function synthetic(people:number):RecordedItemResponse[]{
  const result:RecordedItemResponse[]=[];
  for(let i=0;i<people;i++){
    const skill=i%10;
    for(let q=0;q<6;q++){
      const pass=q===0?skill>=5:q===1?skill<5:q===2?skill>=4:
        q===3?skill>=7:q===4?skill>=3:skill>=6;
      result.push({personKey:"person"+i,formKey:"form-a",itemKey:"i"+q,
        correct:pass?1:0,responseTimeMs:1000+q*300+i});
    }
  }
  return result;
}
test("descriptive item-rest differentiates positively and negatively associated items",()=>{
  const result=auditRecordedBinaryItems(synthetic(220));
  assert.equal(result.status,"descriptive_only");
  assert.equal(result.observedParticipants,220);
  assert.equal(result.recordedMissing,0);
  assert.equal(result.forms[0]!.recordedResponseCoverage,1);
  const good=result.items.find(x=>x.itemKey==="i0")!;
  const bad=result.items.find(x=>x.itemKey==="i1")!;
  assert.ok(good.itemRestCorrelation!==null&&good.itemRestCorrelation>0);
  assert.ok(bad.itemRestCorrelation!==null&&bad.itemRestCorrelation<0);
  assert.ok(bad.flags.includes("negative_item_rest"));
  assert.equal(good.observedAnswers,220);
});
test("missing on recorded rows differs from unadministered item; never score it as incorrect",()=>{
  const source=synthetic(210);
  const item0=source.filter(x=>x.itemKey==="i0");
  const removed=source.filter(x=>!(x.itemKey==="i0"&&Number(x.personKey.slice(6))%3===0));
  const explicit=source.map(x=>x.itemKey==="i0"&&Number(x.personKey.slice(6))%3===0?
    {...x,correct:null as null,responseTimeMs:null}:x);
  const a=auditRecordedBinaryItems(removed),b=auditRecordedBinaryItems(explicit);
  const ra=a.items.find(x=>x.itemKey==="i0")!,rb=b.items.find(x=>x.itemKey==="i0")!;
  assert.equal(ra.observedAnswers,rb.observedAnswers);
  assert.equal(ra.observedAccuracy,rb.observedAccuracy);
  assert.equal(ra.recordedMissing,0);
  assert.equal(rb.recordedMissing,70);
  assert.equal(b.recordedMissing,70);
  assert.equal(b.items.find(x=>x.itemKey==="i1")!.recordedMissing,0);
  assert.equal(item0.length,210);
});
test("fewer than 30 paired other scores means correlation absent, not zero",()=>{
  const x=auditRecordedBinaryItems(synthetic(10));
  assert.equal(x.status,"insufficient_evidence");
  assert.ok(x.items.every(z=>z.itemRestCorrelation===null));
});
test("uniform item accuracy cannot manufacture correlation",()=>{
  const rows=synthetic(220).map(x=>x.itemKey==="i2"?{...x,correct:1 as const}:x);
  const result=auditRecordedBinaryItems(rows);
  assert.equal(result.items.find(x=>x.itemKey==="i2")!.itemRestCorrelation,null);
  assert.ok(result.items.find(x=>x.itemKey==="i2")!.flags.includes("extreme_accuracy"));
});
test("duplicates, invalid response values, timestamps, IDs and missing-times fail closed",()=>{
  const a=synthetic(5),x=a[0]!;
  for(const b of [[x,x],[{...x,correct:2 as 0|1}],
    [{...x,responseTimeMs:NaN}],[{...x,personKey:"name with spaces"}],
    [{...x,correct:null as null,responseTimeMs:500}]]){
    assert.throws(()=>auditRecordedBinaryItems(b),/invalid|duplicate/);
  }
  assert.throws(()=>auditRecordedBinaryItems([]),/sample/);
});
test("same item key in different forms has different independent diagnostics",()=>{
  const original=synthetic(40);
  const second=original.map(x=>({...x,formKey:"form-b",correct:0 as 0}));
  const result=auditRecordedBinaryItems([...original,...second]);
  assert.equal(result.formCount,2);
  const b=result.items.find(x=>x.formKey==="form-b"&&x.itemKey==="i0")!;
  assert.equal(b.observedAccuracy,0);
  assert.equal(b.itemRestCorrelation,null);
});
