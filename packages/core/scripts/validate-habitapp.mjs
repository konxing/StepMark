/**
 * External public-data smoke benchmark, not StepMark habit-progress validation.
 * Upstream: Gera et al. HabitApp, DOI 10.1038/s41467-024-49477-7.
 * Research records are held ephemerally, never bundled into StepMark or a DB.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

export const HABITAPP_SOURCE=Object.freeze({
  repo:"ranigera/HabitApp",
  commit:"fa3166af37f9344be59c499480ada8c28c194ace",
  file:"Analysis/data/extracted_data/core_table.csv",
  blobSha:"66f46ddb154b58c5115c4ef4d803fbce1b9bdb50",
  projectUrl:"https://github.com/ranigera/HabitApp",
  paper:"Gera et al., A novel free-operant framework enables experimental habit induction in humans",
  context:"experimental response entries, NOT self-reported automaticity or StepMark progress"
});
const header="subID,group,manipulation,time,n_entries";
const allowedGroups=new Set(["short_training","long_training","long_training_parallel_manipulations"]);
const allowedConditions=new Set([
 "devaluation","still_valued","still_valued_post_deval",
 "still_valued_post_deval_week1","still_valued_replacing_devaluation","still_valued_week1"
]);
export function gitBlobSha(content){
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(content,"utf8");
  return createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
}
function median(values){
  const v=[...values].sort((a,b)=>a-b);
  return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;
}
function round(n){return Number(n.toFixed(6));}
export function benchmarkHabitAppCsv(content,{verifyPinned=false}={}){
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(content,"utf8");
  if(bytes.length>1_000_000)throw new Error("FILE_TOO_LARGE");
  const hash=gitBlobSha(bytes);
  if(verifyPinned&&hash!==HABITAPP_SOURCE.blobSha)throw new Error("SOURCE_HASH_MISMATCH");
  const lines=bytes.toString("utf8").trim().split(/\r?\n/);
  if(lines.shift()?.trim()!==header)throw new Error("INVALID_SCHEMA");
  if(lines.length>20000)throw new Error("TOO_MANY_ROWS");
  const keys=new Set(),people=new Map(),all=new Set();
  for(const line of lines){
    if(!line.trim())continue;
    const fields=line.split(",");
    if(fields.length!==5)throw new Error("BAD_ROW");
    const [id,group,condition,phase,countStr]=fields;
    if(!/^\d{1,8}$/.test(id)||!allowedGroups.has(group)||
       !allowedConditions.has(condition)||!["pre","post"].includes(phase)||
       !/^(0|[1-9]\d{0,6})$/.test(countStr))throw new Error("INVALID_VALUE");
    const key=[id,group,condition,phase].join("|");
    if(keys.has(key))throw new Error("DUPLICATE_OBSERVATION");
    keys.add(key);
    let entry=people.get(id);
    if(!entry){entry={group,observations:new Map()};people.set(id,entry);}
    if(entry.group!==group)throw new Error("CROSS_GROUP_DUPLICATE");
    entry.observations.set(condition+"|"+phase,Number(countStr));all.add(group);
  }
  const groups=[];
  for(const group of [...all].sort()){
    const differences=[];
    for(const row of people.values()){
      if(row.group!==group)continue;
      const valued=row.observations.get("still_valued|post");
      const devalued=row.observations.get("devaluation|post");
      if(valued===undefined||devalued===undefined)continue;
      differences.push({difference:Math.log1p(valued)-Math.log1p(devalued),
        higher:valued>devalued});
    }
    if(!differences.length)continue;
    const values=differences.map(x=>x.difference);
    groups.push({group,pairedParticipants:values.length,
      meanLog1pContrast:round(values.reduce((a,b)=>a+b,0)/values.length),
      medianLog1pContrast:round(median(values)),
      fractionValuedHigher:round(differences.filter(x=>x.higher).length/values.length)});
  }
  const paired=groups.reduce((s,x)=>s+x.pairedParticipants,0);
  if(!paired)throw new Error("NO_PAIRED_DATA");
  return {status:"descriptive_external_data_check",
    sourceCommit:HABITAPP_SOURCE.commit,sourceBlobSha:hash,
    rowCount:keys.size,participantCount:people.size,
    pairedParticipantCount:paired,groups,
    scope:"Only pairs of experimental response counts under valued vs devalued conditions; does not validate a habit automaticity percentage, causal habit formation time, or ability score."};
}
async function main(){
  const arg=process.argv.indexOf("--input");
  let bytes;
  if(arg>=0){
    if(!process.argv[arg+1]||process.argv.length!==arg+2)throw new Error("Usage: node validate-habitapp.mjs [--input pinned_file.csv]");
    bytes=await readFile(process.argv[arg+1]);
  }else{
    if(process.argv.length>2)throw new Error("Unsupported arguments");
    const fixed="https://raw.githubusercontent.com/"+HABITAPP_SOURCE.repo+"/"+HABITAPP_SOURCE.commit+"/"+HABITAPP_SOURCE.file;
    const response=await fetch(fixed,{redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{"accept":"text/plain"}});
    if(!response.ok)throw new Error("DATA_SOURCE_UNAVAILABLE: HTTP "+response.status);
    const claimed=Number(response.headers.get("content-length")??0);
    if(claimed>1_000_000)throw new Error("FILE_TOO_LARGE");
    bytes=Buffer.from(await response.arrayBuffer());
  }
  const result=benchmarkHabitAppCsv(bytes,{verifyPinned:true});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{process.stderr.write("Research benchmark failed: "+e.message+"\n");process.exitCode=1;});
}
