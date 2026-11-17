/**
 * Offline private-bank *review evidence* audit. This is not publication,
 * a reviewer identity verification service, or proof of psychometric validity.
 *
 * An approval statement is bound to the EXACT private bank SHA-256 and kept
 * OUTSIDE the public repository. Never print reviewer identifiers or drafts.
 */
import {readFile,realpath,stat} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
  auditPrivateResearchBankFile,repositoryPathAllowed
} from "./audit-private-research-bank.mjs";
const roles=["content","psychometrics","rights_security"];
const checklist=[
  "constructFit","answerKeyVerified","languageReviewed",
  "rightsConfirmed","exposureRiskReviewed","noSensitiveContent"
];
const fieldset=(value,keys)=>value!==null&&typeof value==="object"&&
  !Array.isArray(value)&&Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
function reject(code){throw new Error(code);}
const isValidSha=value=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
export function auditPrivateReviewManifest(manifest,sourceSha256,now=new Date()){
  if(!isValidSha(sourceSha256)||!Number.isFinite(now.getTime()))
    reject("PRIVATE_REVIEW_CONTEXT_INVALID");
  if(!fieldset(manifest,["kind","bankSha256","reviewers"])||
    manifest.kind!=="stepmark-private-bank-review-v1"||
    !isValidSha(manifest.bankSha256))
    reject("PRIVATE_REVIEW_MANIFEST_SCHEMA_INVALID");
  if(manifest.bankSha256!==sourceSha256)
    reject("PRIVATE_REVIEW_BANK_VERSION_MISMATCH");
  if(!Array.isArray(manifest.reviewers)||manifest.reviewers.length!==3)
    reject("PRIVATE_REVIEW_ROLES_REQUIRED");
  const seenRoles=new Set(),seenReviewers=new Set();
  let needsRevision=false;
  for(const entry of manifest.reviewers){
    if(!fieldset(entry,["reviewerRef","role","reviewedOn","decision","checks"])||
      typeof entry.reviewerRef!=="string"||
      !/^reviewer-[a-z0-9_-]{5,40}$/.test(entry.reviewerRef)||
      !roles.includes(entry.role)||
      !["pass","revise"].includes(entry.decision)||
      typeof entry.reviewedOn!=="string"||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn)||
      !fieldset(entry.checks,checklist)||
      !checklist.every(key=>["pass","revise"].includes(entry.checks[key])))
      reject("PRIVATE_REVIEW_ENTRY_INVALID");
    if(seenRoles.has(entry.role)||seenReviewers.has(entry.reviewerRef))
      reject("PRIVATE_REVIEW_ROLES_NOT_INDEPENDENTLY_DECLARED");
    seenRoles.add(entry.role);seenReviewers.add(entry.reviewerRef);
    const timestamp=Date.parse(entry.reviewedOn+"T00:00:00Z");
    if(!Number.isFinite(timestamp)||
      new Date(timestamp).toISOString().slice(0,10)!==entry.reviewedOn||
      timestamp>now.getTime()||now.getTime()-timestamp>180*86400000)
      reject("PRIVATE_REVIEW_DATE_INVALID_OR_STALE");
    if(entry.decision==="revise"||checklist.some(key=>entry.checks[key]==="revise"))
      needsRevision=true;
  }
  if(roles.some(role=>!seenRoles.has(role)))reject("PRIVATE_REVIEW_ROLES_REQUIRED");
  return {
    auditVersion:"private-review-evidence-v1",
    sourceSha256,
    reviewDeclarations:manifest.reviewers.length,
    checkedDimensions:checklist.length,
    evidenceState:needsRevision?
      "REVISIONS_RECORDED":"COMPLETE_UNVERIFIED_REVIEW_DECLARATIONS",
    releaseGate:"BLOCKED_PENDING_AUTHENTICATED_REVIEW_AND_CALIBRATION",
    warning:"Pseudonymous entries, self-declared verdicts and hashes are not identities, signatures, copyright grants, psychological validity, or permission to deploy. The offline report never exposes questions, responses, reviewer IDs or answer keys."
  };
}
async function readPrivateReviewFile(input){
  if(typeof input!=="string"||!input.length||!repositoryPathAllowed(input))
    reject("PRIVATE_REVIEW_MUST_BE_OUTSIDE_REPOSITORY");
  const canonical=await realpath(resolve(input));
  if(!repositoryPathAllowed(canonical))reject("PRIVATE_REVIEW_MUST_BE_OUTSIDE_REPOSITORY");
  const info=await stat(canonical);
  if(!info.isFile()||info.size<80||info.size>16384)
    reject("PRIVATE_REVIEW_FILE_SIZE_INVALID");
  const bytes=await readFile(canonical);
  if(bytes.length!==info.size)reject("PRIVATE_REVIEW_SOURCE_CHANGED_DURING_READ");
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{reject("PRIVATE_REVIEW_JSON_INVALID");}
}
export async function auditPrivateReviewFiles(bankPath,reviewPath,now=new Date()){
  // Validate question bank without reading its content into the stdout or
  // exposing the private bank path.
  const bank=await auditPrivateResearchBankFile(bankPath);
  const review=await readPrivateReviewFile(reviewPath);
  return {bankItemCount:bank.itemCount,
    ...auditPrivateReviewManifest(review,bank.sourceSha256,now)};
}
async function main(){
  if(process.argv.length!==6||process.argv[2]!=="--bank"||process.argv[4]!=="--reviews")
    reject("PRIVATE_REVIEW_USAGE_INVALID");
  const summary=await auditPrivateReviewFiles(process.argv[3],process.argv[5]);
  process.stdout.write(JSON.stringify(summary,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(err=>{
    const msg=typeof err?.message==="string"?err.message:"";
    const code=/^PRIVATE_[A-Z0-9_]+$/.test(msg)?msg:"PRIVATE_REVIEW_FILES_UNAVAILABLE";
    process.stderr.write("PRIVATE_REVIEW_AUDIT_BLOCKED: "+code+"\n");
    process.exitCode=1;
  });
