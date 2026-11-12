import {createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {evaluateAutomaticitySeries} from "../src/validation.ts";

/**
 * REAL observational research benchmark, no personal records are committed,
 * logged or uploaded. Data held exclusively on an ephemeral GitHub runner.
 *
 * Fiorella (2026), https://doi.org/10.1007/s10648-026-10235-3
 * https://osf.io/zty5s/ (public study package; explicit dataset reuse license
 * has NOT been verified, so this is research-only and cannot be redistributed).
 */
const PROJECT="zty5s",NAME="OSF_review_package.zip";
const EXPECTED="4eb4b87fd50390fe095f4119add927ec7fe8195b5e05b091a30123058cbe4e09";
const MEMBER="OSF_review_package_revision2_FINAL/model_outputs/manuscript_mixed_models/automaticity_growth_model.csv";
const EXPECTED_TYPES=["four_item_mean","decide_perform_mean","decide_single_item"];

function csvRows(content){
  if(Buffer.byteLength(content,"utf8")>12_000_000)throw new Error("CSV_OVERSIZE");
  const rows=[];
  let row=[],cell="",quoted=false;
  for(let i=0;i<content.length;i++){
    const char=content[i];
    if(char==='"'){
      if(quoted&&content[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(char===","&&!quoted){row.push(cell);cell="";}
    else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&content[i+1]==="\n")i++;
      row.push(cell);cell="";
      if(row.some(s=>s.length))rows.push(row);
      row=[];
      if(rows.length>12000)throw new Error("ROW_LIMIT");
    }else{cell+=char;}
  }
  if(quoted)throw new Error("UNCLOSED_QUOTE");
  if(row.length||cell){row.push(cell);rows.push(row);}
  return rows;
}
async function loadVerifiedZip(){
  const url="https://api.osf.io/v2/nodes/"+PROJECT+"/files/osfstorage/";
  const listed=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!listed.ok)throw new Error("OSF_FILE_LIST_ERROR_"+listed.status);
  const listing=await listed.json();
  const item=listing?.data?.find(x=>x.attributes?.name===NAME);
  if(!item)throw new Error("OSF_PACKAGE_MISSING");
  const location=new URL(item.links.download);
  if(location.protocol!=="https:"||!["osf.io","files.osf.io"].includes(location.hostname))
    throw new Error("OSF_DOWNLOAD_ORIGIN_UNTRUSTED");
  const res=await fetch(location,{signal:AbortSignal.timeout(70000)});
  if(!res.ok)throw new Error("OSF_DOWNLOAD_"+res.status);
  if(Number(res.headers.get("content-length")??0)>32_000_000)throw new Error("ZIP_OVERSIZE");
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length>32_000_000)throw new Error("ZIP_OVERSIZE");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  if(sha256!==EXPECTED)throw new Error("VERSION_INTEGRITY_MISMATCH");
  return {bytes,sha256};
}
function parseRows(source){
  const raw=csvRows(source);
  const header=raw.shift();
  if(!header)throw new Error("EMPTY_CSV");
  const need=["participant_id","semester","automaticity_score_type","study_day",
    "automaticity_score","cumulative_prior_behavior_count"];
  for(const name of need)if(!header.includes(name))throw new Error("MISSING_COLUMN_"+name);
  const accepted=new Set(EXPECTED_TYPES);
  const byType=new Map(EXPECTED_TYPES.map(k=>[k,[]]));
  const groups=new Set(),individuals=new Set();
  for(const cells of raw){
    if(cells.length!==header.length)throw new Error("MALFORMED_CSV");
    const obj=Object.fromEntries(header.map((k,i)=>[k,cells[i]]));
    const {participant_id:id,semester,automaticity_score_type:type}=obj;
    if(!id||!semester||!accepted.has(type))throw new Error("UNEXPECTED_COHORT");
    const day=Number(obj.study_day),x=Number(obj.cumulative_prior_behavior_count),
      automaticity=Number(obj.automaticity_score);
    if(!Number.isSafeInteger(day)||day<0||!Number.isSafeInteger(x)||x<0||
      !Number.isFinite(automaticity)||automaticity<1||automaticity>7)
      throw new Error("INVALID_AUTO_OR_REPETITIONS");
    // Source's identifiers are not exported. Group+id guards cross-semester reuse.
    const pseudo="p_"+createHash("sha256").update(semester+":"+id).digest("hex").slice(0,20);
    byType.get(type).push({participantId:pseudo,day,
      effectiveRepetitions:x,automaticity:(automaticity-1)/6*100});
    groups.add(semester);individuals.add(pseudo);
  }
  if(raw.length!==9416||individuals.size!==175||groups.size!==5)
    throw new Error("PUBLISHED_COUNTS_MISMATCH");
  return byType;
}
async function main(){
  const {bytes,sha256}=await loadVerifiedZip();
  const dir=await mkdtemp(join(tmpdir(),"stepmark-validate-"));
  try{
    const file=join(dir,"source.zip");await writeFile(file,bytes);
    const csv=execFileSync("unzip",["-p",file,MEMBER],{
      encoding:"utf8",timeout:15000,maxBuffer:12_000_000});
    const groups=parseRows(csv);
    const summaries=[];
    for(const [measure,records] of groups){
      const result=evaluateAutomaticitySeries(records);
      summaries.push({measure,quality:result.quality,
        recordedMissingness:result.recordedMissingness,
        models:{
          lastObservation:result.lastObservation,
          constantMean:result.constantMean,
          linear:result.trendCandidates.linear,
          squareRoot:result.trendCandidates.square_root,
          logarithmic:result.trendCandidates.logarithmic,
          asymptoticCurve:result.asymptoticCurve,
          matchedLastForAsymptote:result.matchedLastObservation,
          pairedAsymptote:result.pairedAsymptote,
          pairedTrends:result.pairedTrends
        },
        evaluationType:"person-stratified time-forward predictive check; unlinked self-report scales"});
    }
    process.stdout.write(JSON.stringify({
      status:"EXTERNAL_REAL_RESEARCH_DATA_ANALYZED",
      source:"Fiorella 2026 OSF zty5s",
      archiveSha256:sha256,
      participantLevelDataPersisted:false,
      licensedForRedistribution:false,
      caution:"Study observational; individual trend comparison is not a mixed-effect model replication or validated StepMark 0–100 habit progress. Measure cohorts are not pooled. Do not select the best model on the same held-out data for product use.",
      groups:summaries
    },null,2)+"\n");
  }finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{process.stderr.write("Fiorella research validation failed: "+e.message+"\n");process.exitCode=1;});
