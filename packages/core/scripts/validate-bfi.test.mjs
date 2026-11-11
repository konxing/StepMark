import {test} from "node:test";
import assert from "node:assert/strict";
import {parseBfiCsv,diagnoseScale,benchmarkBfi,blobSha,SOURCE} from "./validate-bfi.mjs";
const headers=["rownames",...["A","C","E","N","O"].flatMap(s=>
 Array.from({length:5},(_,i)=>s+(i+1))),"gender","education","age"].join(",");
const fixture=[headers,"123,"+Array(25).fill("4").join(",")+",1,4,28"].join("\n");
test("pinned psych::bfi source cannot be replaced, with strict item schema",()=>{
 assert.equal(parseBfiCsv(fixture).length,1);
 assert.throws(()=>benchmarkBfi(fixture,{verifyPinned:true}),/CHECKSUM/);
 assert.throws(()=>parseBfiCsv(fixture.replace("A1","X1")),/SCHEMA/);
 assert.throws(()=>parseBfiCsv(fixture+"\n"+fixture.split("\n")[1]),/DUPLICATE/);
 assert.throws(()=>parseBfiCsv(fixture.replace(",4,4,4,",",7,4,4,")),/INVALID_BFI_RESPONSE/);
 assert.match(blobSha(fixture),/^[a-f0-9]{40}$/);
 assert.equal(SOURCE.blobSha.length,40);
});
test("raw alpha respects reverse scoring, complete case missingness and variance",()=>{
 const rows=[];
 // A1 is reverse-keyed. Setting it to 7-x makes all five keyed A items identical.
 for(let i=0;i<40;i++){
  const v=1+(i%6);
  const row=Array(25).fill(3);
  row[0]=7-v;for(let j=1;j<5;j++)row[j]=v;
  rows.push(row);
 }
 const r=diagnoseScale(rows,"A");
 assert.equal(r.status,"descriptive_internal_consistency");
 assert.equal(r.complete,40);
 assert.equal(r.rawAlpha,1);
 assert.equal(r.minCorrectedItemTotal,1);
 rows[0][2]=null;
 const missing=diagnoseScale(rows,"A");
 assert.equal(missing.complete,39);
 assert.equal(missing.missing,1);
 const insufficient=diagnoseScale([rows[0]],"A");
 assert.equal(insufficient.status,"insufficient_complete_cases");
});
test("constant and invalid responses are rejected or flagged, not scored as valid",()=>{
 const flat=Array.from({length:12},()=>Array(25).fill(3));
 assert.equal(diagnoseScale(flat,"N").status,"zero_total_variance");
 assert.throws(()=>diagnoseScale(flat,"Z"),/INVALID_SCALE/);
 const invalid=flat.map(x=>[...x]);invalid[0][1]=9;
 assert.throws(()=>diagnoseScale(invalid,"A"),/INVALID_SCALE/);
});
