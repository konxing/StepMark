import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  auditPrivateResearchBank,auditPrivateResearchBankFile,repositoryPathAllowed
} from "./audit-private-research-bank.mjs";
const SKILLS=["conditional","evidence","quantitative"];
const FORMS=["research-logic-a-v2","research-logic-b-v2"];
function fixture(){
  return {kind:"stepmark-private-research-bank-v1",bankVersion:"research-logic-v2",
    constructCode:"reasoning.logic",researchOnly:true,forms:FORMS.map((code,f)=>({
      code,items:Array.from({length:18},(_,i)=>({
        id:randomUUID(),order:i+1,skillCode:SKILLS[i%3],
        prompt:"纯测试虚构问题，独立题目编号 "+code+" "+(i+1)+
          "，这不是用于真实用户的心理测验题目。",
        options:["A","B","C","D"].map((key,j)=>({key,label:"模拟选项 "+key+" "+j})),
        correctKey:["A","B","C","D"][i%4],
        explanation:"这是占位内容，不支持判断真实推理能力，也不能直接作为正式测验。"
      }))
    }))};
}
test("private research bank draft audit reports only metadata, not item text or key",()=>{
  const value=fixture();
  const result=auditPrivateResearchBank(value);
  assert.equal(result.itemCount,36);
  assert.equal(result.status,"offline_draft_structure_only");
  assert.equal(result.forms[0].skillCounts.conditional,6);
  assert.equal(result.releaseGate,"BLOCKED_PENDING_INDEPENDENT_CONTENT_AND_SECURITY_REVIEW");
  const exposed=JSON.stringify(result);
  assert.equal(exposed.includes(value.forms[0].items[0].prompt),false);
  assert.equal(exposed.includes("correctKey"),false);
  assert.equal(exposed.includes("explanation"),false);
  assert.equal(exposed.includes(value.forms[0].items[0].id),false);
});
test("reject public bank codes, invalid answers, mismatched skill counts and hidden extra fields",()=>{
  const cases=[
    b=>{b.forms[0].code="logic-a-v1";},
    b=>{b.forms[0].items[0].correctKey="Z";},
    b=>{b.forms[0].items[0].skillCode="evidence";},
    b=>{b.forms[1].items[0].id=b.forms[0].items[0].id;},
    b=>{b.forms[1].items[0].prompt=b.forms[0].items[0].prompt;},
    b=>{b.forms[1].items[0].options[0].label=b.forms[1].items[0].options[1].label;},
    b=>{b.forms[0].items[0].publishedAt="2026-11-17";},
    b=>{b.forms[0].items.pop();}
  ];
  for(const mutate of cases){
    const value=fixture();mutate(value);
    assert.throws(()=>auditPrivateResearchBank(value),/^Error: PRIVATE_/);
  }
});
test("disallow repository file location even if valid; accept disposable external file",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"stepmark-private-bank-"));
  const filename=join(folder,"audit-fixture.json");
  try{
    const bank=fixture();
    await writeFile(filename,JSON.stringify(bank),"utf8");
    assert.equal(repositoryPathAllowed(filename),true);
    assert.equal(repositoryPathAllowed(fileURLToPath(import.meta.url)),false);
    const result=await auditPrivateResearchBankFile(filename);
    assert.match(result.sourceSha256,/^[0-9a-f]{64}$/);
    const cli=spawnSync(process.execPath,[
      fileURLToPath(new URL("./audit-private-research-bank.mjs",import.meta.url)),
      "--input",filename
    ],{encoding:"utf8"});
    assert.equal(cli.status,0,cli.stderr);
    assert.equal(cli.stdout.includes(bank.forms[0].items[0].prompt),false);
    const blocked=spawnSync(process.execPath,[
      fileURLToPath(new URL("./audit-private-research-bank.mjs",import.meta.url)),
      "--input",fileURLToPath(import.meta.url)
    ],{encoding:"utf8"});
    assert.notEqual(blocked.status,0);
    assert.match(blocked.stderr,/MUST_BE_OUTSIDE_REPOSITORY/);
    assert.equal(blocked.stderr.includes(bank.forms[0].items[0].prompt),false);
  }finally{await rm(folder,{recursive:true,force:true});}
});
test("reject invalid JSON, output no details of private content",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"stepmark-private-bank-invalid-"));
  try{
    const path=join(folder,"bad.json");
    await writeFile(path,"not a valid JSON file ".repeat(10),"utf8");
    await assert.rejects(()=>auditPrivateResearchBankFile(path),/PRIVATE_BANK_JSON_INVALID/);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test("missing private file never leaks absolute local paths in process diagnostics",()=>{
  const fake=join(tmpdir(),"stepmark-private-bank-no-such-"+randomUUID()+".json");
  const child=spawnSync(process.execPath,[
    fileURLToPath(new URL("./audit-private-research-bank.mjs",import.meta.url)),
    "--input",fake
  ],{encoding:"utf8"});
  assert.notEqual(child.status,0);
  assert.match(child.stderr,/PRIVATE_BANK_ACCESS_OR_READ_FAILED/);
  assert.equal(child.stderr.includes(fake),false);
  assert.equal(child.stdout,"");
});
