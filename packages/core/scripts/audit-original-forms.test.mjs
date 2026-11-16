import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseOriginalForms,auditOriginalForms,verifyFrozenSource} from "./audit-original-forms.mjs";
const fixture=await readFile("apps/web/prisma/seed.ts","utf8");
const lock=JSON.parse(await readFile("docs/research/locks/original-logic-forms-v1.json","utf8"));
const clone=items=>structuredClone(items);
test("existing original demo forms have complete and explicitly uncalibrated blueprint",()=>{
  assert.ok(verifyFrozenSource(fixture,lock).sourceSha256.length===64);
  const x=auditOriginalForms(parseOriginalForms(fixture));
  assert.equal(x.status,"structural_integrity_only_not_calibrated");
  assert.equal(x.forms.length,2);
  assert.ok(x.forms.every(f=>f.items===6));
  assert.ok(x.forms.every(f=>f.warnings.includes("ANSWER_POSITION_CONCENTRATION_MAY_CUE_RESPONSES")));
  assert.match(x.testSecurityWarning,/public repository/);
});
test("published source lock rejects accidental edits including silent answer changes",()=>{
  assert.throws(()=>verifyFrozenSource(fixture.replace("备份校验","备份检查"),lock),/LOCK_DRIFT/);
  assert.throws(()=>verifyFrozenSource(fixture,{...lock,expectedGitBlobSha1:"bad"}),/BAD_LOCK/);
  assert.throws(()=>parseOriginalForms(fixture.replace("const newForms=[","const newForms=build(")),/STATIC_JSON/);
});
test("detect duplicate item IDs, prompts, answer keys, options and original skill drift",()=>{
  const original=parseOriginalForms(fixture);
  const cases=[
    [0,"id",original[1].id,/DUPLICATE_OR_INVALID/],
    [0,"prompt",original[1].prompt,/EXACT_DUPLICATE/],
    [0,"correctKey","F",/INVALID_CORRECT_KEY/],
    [0,"options",original[0].options.map((v,i)=>i===3?original[0].options[0]:v),/DUPLICATE_OPTION/],
    [0,"skillCode","quantitative",/SKILL_BLUEPRINT/],
    [0,"formOrder",2,/FORM_ITEM_ORDER/],
    [0,"explanation","",/MISSING_PROMPT/]
  ];
  for(const [index,key,value,pattern] of cases){
    const rows=clone(original);
    rows[index][key]=value;
    assert.throws(()=>auditOriginalForms(rows),pattern);
  }
  assert.throws(()=>auditOriginalForms(original.slice(0,11)),/REQUIRES_12/);
});
