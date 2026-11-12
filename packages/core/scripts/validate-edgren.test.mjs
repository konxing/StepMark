import {test} from "node:test";
import assert from "node:assert/strict";
import {parseDecayCsv,compareDecay} from "./validate-edgren.mjs";
const prefix="respid,BEHAV,StudyDay,SRBAI,StudyDay_new";
function fixture(fn){
  const rows=[prefix];
  for(let day=7;day<=60;day++){
    const val=fn(day-7);
    rows.push("123456,SED,"+day+","+(val===null?"NA":String(val))+","+(day-7));
  }
  return rows.join("\n");
}
test("longitudinal decay retains missing=NA without falsely treating it as zero",()=>{
  const d=parseDecayCsv(fixture(day=>day%8===0?null:Math.max(0,3.4-0.04*day)));
  assert.equal(d.people.size,1);
  assert.ok(d.missing>0);
  const a=compareDecay(d);
  assert.equal(a.groups.find(x=>x.group==="SED").participants,1);
  assert.ok(a.observed>0);
});
test("schema errors and out-of-scale SRBAI are rejected",()=>{
  assert.throws(()=>parseDecayCsv(fixture(()=>3.5).replace("StudyDay_new","Bad")),/SCHEMA_MISMATCH/);
  assert.throws(()=>parseDecayCsv(fixture(()=>5)),/INVALID_SRBAI/);
  assert.throws(()=>parseDecayCsv(fixture(()=>2).replace("123456,SED,7","123456,OTHER,7")),/SUBJECT_OR_GROUP_INVALID/);
});
