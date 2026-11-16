/**
 * Research-admission structural audit for StepMark's ORIGINAL demo forms.
 * Read seed source as plain JSON, never import seed.ts (which initializes DB).
 * This proves fixture structure, NOT psychometric validity or question secrecy.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

export const LOCK_PATH="docs/research/locks/original-logic-forms-v1.json";
const forms=["logic-a-v1","logic-b-v1"];
const skills=["conditional","evidence","quantitative"];
const keyPattern=/^[A-D]$/;
const normalized=s=>s.trim().replace(/\s+/gu," ");
function sha256(buffer){return createHash("sha256").update(buffer).digest("hex");}
export function gitBlobSha1(value){
  if(typeof value!=="string")throw new TypeError("SEED_SOURCE_REQUIRED");
  const bytes=Buffer.from(value,"utf8");
  return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}
export function parseOriginalForms(source){
  if(typeof source!=="string"||source.length>300000||source.length<100)
    throw new Error("SOURCE_INVALID");
  const start="const newForms=";
  const first=source.indexOf(start);
  if(first<0||source.indexOf(start,first+start.length)>=0)
    throw new Error("FORM_LITERAL_NOT_UNIQUE");
  const end=source.indexOf("];",first);
  if(end<0||!source.slice(end+2).match(/^\s*async function main\(/u))
    throw new Error("FORM_LITERAL_END_UNEXPECTED");
  const json=source.slice(first+start.length,end+1);
  let parsed;
  try{parsed=JSON.parse(json);}catch{throw new Error("FORM_LITERAL_MUST_REMAIN_STATIC_JSON");}
  if(!Array.isArray(parsed))throw new Error("FORM_LITERAL_NOT_ARRAY");
  return parsed;
}
export function auditOriginalForms(items){
  if(!Array.isArray(items)||items.length!==12)throw new Error("ORIGINAL_BANK_REQUIRES_12_ITEMS");
  const ids=new Set(),allPrompts=new Set(),report=[];
  for(const name of forms){
    const formItems=items.filter(item=>item?.formCode===name);
    if(formItems.length!==6)throw new Error("FORM_SIZE_CHANGED");
    const positions=new Set(),keys={A:0,B:0,C:0,D:0};
    const perSkill={conditional:0,evidence:0,quantitative:0};
    for(const row of formItems){
      if(typeof row.id!=="string"||!/^[a-f0-9-]{36}$/u.test(row.id)||ids.has(row.id))
        throw new Error("DUPLICATE_OR_INVALID_ITEM_ID");
      ids.add(row.id);
      if(!Number.isInteger(row.formOrder)||row.formOrder<1||row.formOrder>6||
         positions.has(row.formOrder))throw new Error("FORM_ITEM_ORDER_INVALID");
      positions.add(row.formOrder);
      if(!skills.includes(row.skillCode))throw new Error("UNKNOWN_SKILL");
      perSkill[row.skillCode]++;
      if(typeof row.prompt!=="string"||normalized(row.prompt).length<15||
         typeof row.explanation!=="string"||normalized(row.explanation).length<10)
        throw new Error("MISSING_PROMPT_OR_RATIONALE");
      const prompt=normalized(row.prompt);
      if(allPrompts.has(prompt))throw new Error("EXACT_DUPLICATE_PROMPT_ACROSS_FORMS");
      allPrompts.add(prompt);
      if(!Array.isArray(row.options)||row.options.length!==4||
         !row.options.every(option=>option&&keyPattern.test(option.key)&&
           typeof option.label==="string"&&normalized(option.label).length>0))
        throw new Error("INVALID_FOUR_OPTION_FORMAT");
      if(new Set(row.options.map(o=>o.key)).size!==4||
         new Set(row.options.map(o=>normalized(o.label))).size!==4)
        throw new Error("DUPLICATE_OPTION_KEY_OR_TEXT");
      if(!keyPattern.test(row.correctKey)||
         !row.options.some(o=>o.key===row.correctKey))
        throw new Error("INVALID_CORRECT_KEY");
      keys[row.correctKey]++;
    }
    if(!skills.every(s=>perSkill[s]===2))throw new Error("SKILL_BLUEPRINT_CHANGED");
    const answerMajorityShare=Math.max(...Object.values(keys))/formItems.length;
    report.push({code:name,items:formItems.length,skillCounts:perSkill,
      answerKeyDistribution:keys,answerMajorityShare,
      warnings:answerMajorityShare>=.5?
        ["ANSWER_POSITION_CONCENTRATION_MAY_CUE_RESPONSES"]:[]});
  }
  // Explicitly distinguish bank integrity from psychometric validity.
  return {version:"original-logic-bank-audit-v1",
    status:"structural_integrity_only_not_calibrated",
    auditedItems:items.length,
    forms:report,
    testSecurityWarning:"Published answer keys are visible in the public repository. These are DEMONSTRATION forms, not secure independent cognitive tests.",
    limits:"No human-reviewed content validity, reliability, item parameters, A/B linking, measurement invariance, retest norms, or participant confidentiality is established by this file audit."};
}
export function verifyFrozenSource(source,lock){
  if(!lock||lock.schemaVersion!=="original-logic-source-lock-v1"||
     lock.sourcePath!=="apps/web/prisma/seed.ts"||
     typeof lock.expectedGitBlobSha1!=="string"||
     !/^[a-f0-9]{40}$/u.test(lock.expectedGitBlobSha1))
    throw new Error("BAD_LOCK_MANIFEST");
  const current=gitBlobSha1(source);
  if(current!==lock.expectedGitBlobSha1)throw new Error("ORIGINAL_PUBLISHED_BANK_LOCK_DRIFT");
  return {seedGitBlobSha1:current,sourceSha256:sha256(Buffer.from(source))};
}
async function main(){
  if(process.argv.length!==3||process.argv[2]!=="--verify")
    throw new Error("Usage: node .../audit-original-forms.mjs --verify");
  const [source,lockRaw]=await Promise.all([
    readFile("apps/web/prisma/seed.ts","utf8"),
    readFile(LOCK_PATH,"utf8")
  ]);
  const lock=JSON.parse(lockRaw);
  const pinned=verifyFrozenSource(source,lock);
  const audited=auditOriginalForms(parseOriginalForms(source));
  process.stdout.write(JSON.stringify({...audited,...pinned},null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{
    process.stderr.write("Original form source admission blocked: "+error.message+"\n");
    process.exitCode=1;
  });
