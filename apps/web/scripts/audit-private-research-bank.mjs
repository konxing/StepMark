/**
 * StepMark private research-bank *offline* admission (not publication).
 * Read question content from a file OUTSIDE this public git checkout.
 * NEVER import, log, persist or emit answers/questions.
 */
import {readFile,realpath,stat} from "node:fs/promises";
import {resolve,relative,isAbsolute} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";

const REPOSITORY_ROOT=resolve(fileURLToPath(new URL("../../../",import.meta.url)));
const FORM_CODES=["research-logic-a-v2","research-logic-b-v2"];
const SKILLS=["conditional","evidence","quantitative"];
const KEYS=["A","B","C","D"];
const MAX_FILE_BYTES=131072;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const clean=s=>s.normalize("NFKC").replace(/\s+/gu," ").trim();
const fail=code=>{throw new Error(code);};
const exactKeys=(object,expected)=>object&&typeof object==="object"&&
  !Array.isArray(object)&&
  Object.keys(object).sort().join("|")===expected.slice().sort().join("|");

function bigrams(text){
  const s=clean(text).replace(/[\p{P}\p{S}\s]/gu,"");
  const result=new Set();
  for(let i=0;i<s.length-1;i++)result.add(s.slice(i,i+2));
  return result;
}
function similarity(a,b){
  if(!a.size||!b.size)return 0;
  let overlap=0;
  for(const gram of a)if(b.has(gram))overlap++;
  return overlap/(a.size+b.size-overlap);
}
function structure(bank){
  if(!exactKeys(bank,["kind","bankVersion","constructCode","researchOnly","forms"])||
    bank.kind!=="stepmark-private-research-bank-v1"||
    bank.bankVersion!=="research-logic-v2"||
    bank.constructCode!=="reasoning.logic"||bank.researchOnly!==true||
    !Array.isArray(bank.forms)||bank.forms.length!==2)
    fail("PRIVATE_BANK_SCHEMA_INVALID");
  const idSet=new Set(),promptHashes=new Set(),allPrompts=[];
  const forms=[];
  for(let i=0;i<2;i++){
    const form=bank.forms[i];
    if(!exactKeys(form,["code","items"])||form.code!==FORM_CODES[i]||
      !Array.isArray(form.items)||form.items.length<18||form.items.length>72||
      form.items.length%3!==0)fail("PRIVATE_FORM_BLUEPRINT_INVALID");
    const counts={conditional:0,evidence:0,quantitative:0};
    const distribution={A:0,B:0,C:0,D:0};
    const positions=new Set();
    for(const row of form.items){
      if(!exactKeys(row,["id","order","skillCode","prompt","options","correctKey","explanation"])||
        typeof row.id!=="string"||!uuid.test(row.id)||idSet.has(row.id)||
        !Number.isInteger(row.order)||row.order<1||row.order>form.items.length||
        positions.has(row.order)||!SKILLS.includes(row.skillCode))
        fail("PRIVATE_ITEM_ID_OR_BLUEPRINT_INVALID");
      idSet.add(row.id);positions.add(row.order);counts[row.skillCode]++;
      if(typeof row.prompt!=="string"||clean(row.prompt).length<25||
        clean(row.prompt).length>1800||typeof row.explanation!=="string"||
        clean(row.explanation).length<15||clean(row.explanation).length>1500)
        fail("PRIVATE_ITEM_TEXT_INVALID");
      const normalized=clean(row.prompt);
      if(promptHashes.has(normalized))fail("PRIVATE_EXACT_DUPLICATE_QUESTION");
      promptHashes.add(normalized);allPrompts.push(bigrams(normalized));
      if(!Array.isArray(row.options)||row.options.length!==4||
        row.options.some((o,j)=>!exactKeys(o,["key","label"])||
          o.key!==KEYS[j]||typeof o.label!=="string"||
          clean(o.label).length<2||clean(o.label).length>350)||
        new Set(row.options.map(o=>clean(o.label))).size!==4)
        fail("PRIVATE_OPTIONS_INVALID");
      if(!KEYS.includes(row.correctKey))fail("PRIVATE_ANSWER_KEY_INVALID");
      distribution[row.correctKey]++;
    }
    if(positions.size!==form.items.length||
      SKILLS.some(skill=>counts[skill]!==form.items.length/3))
      fail("PRIVATE_SKILL_BALANCE_INVALID");
    forms.push({code:form.code,itemCount:form.items.length,
      skillCounts:counts,answerKeyDistribution:distribution,
      answerPositionConcentration:Math.max(...Object.values(distribution))/form.items.length});
  }
  let nearDuplicatePairs=0;
  for(let i=0;i<allPrompts.length;i++){
    for(let j=i+1;j<allPrompts.length;j++){
      if(similarity(allPrompts[i],allPrompts[j])>=.85)nearDuplicatePairs++;
    }
  }
  const warnings=[];
  if(forms.some(f=>f.answerPositionConcentration>.4))warnings.push("ANSWER_POSITION_CONCENTRATION");
  if(nearDuplicatePairs>0)warnings.push("NEAR_DUPLICATE_QUESTION_REVIEW_REQUIRED");
  return {status:"offline_draft_structure_only",version:"private-bank-admission-v1",
    formCount:forms.length,itemCount:idSet.size,forms,nearDuplicatePairs,warnings,
    releaseGate:"BLOCKED_PENDING_INDEPENDENT_CONTENT_AND_SECURITY_REVIEW",
    notes:"The audit does not prove validity, equating, calibration, consent, encryption at rest, or secure administration. It imports nothing into production and does not publish answers."};
}
export function auditPrivateResearchBank(bank){
  return structure(bank);
}
export function repositoryPathAllowed(input,root=REPOSITORY_ROOT){
  const path=resolve(input);
  const rel=relative(root,path);
  return rel===".."?true:(rel.startsWith(".."+(process.platform==="win32"?"\\":"/"))||isAbsolute(rel));
}
export async function auditPrivateResearchBankFile(input){
  if(typeof input!=="string"||!input.length)fail("PRIVATE_BANK_PATH_REQUIRED");
  if(!repositoryPathAllowed(input))fail("PRIVATE_BANK_MUST_BE_OUTSIDE_REPOSITORY");
  const sourcePath=await realpath(input);
  if(!repositoryPathAllowed(sourcePath))fail("PRIVATE_BANK_MUST_BE_OUTSIDE_REPOSITORY");
  const info=await stat(sourcePath);
  if(!info.isFile()||info.size<100||info.size>MAX_FILE_BYTES)
    fail("PRIVATE_BANK_FILE_SIZE_INVALID");
  const bytes=await readFile(sourcePath);
  if(bytes.length!==info.size||bytes.length>MAX_FILE_BYTES)
    fail("PRIVATE_BANK_SOURCE_CHANGED_WHILE_READING");
  let bank;
  try{bank=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{fail("PRIVATE_BANK_JSON_INVALID");}
  const report=structure(bank);
  return {...report,sourceSha256:createHash("sha256").update(bytes).digest("hex")};
}
async function main(){
  if(process.argv.length!==4||process.argv[2]!=="--input")
    fail("USAGE_NODE_AUDIT_PRIVATE_BANK_INPUT_ABSOLUTE_PATH");
  // Never echo paths or parsing input; either aggregates or error codes.
  const report=await auditPrivateResearchBankFile(process.argv[3]);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{
    // Filesystem errors can embed private absolute paths. Only allow controlled
    // validator error codes to escape; never print arbitrary exception text.
    const message=typeof error?.message==="string"?error.message:"";
    const code=/^PRIVATE_[A-Z0-9_]+$|^USAGE_NODE_AUDIT_PRIVATE_BANK_INPUT_ABSOLUTE_PATH$/.test(message)?
      message:"PRIVATE_BANK_ACCESS_OR_READ_FAILED";
    process.stderr.write("PRIVATE_BANK_ADMISSION_BLOCKED: "+code+"\n");
    process.exitCode=1;
  });
