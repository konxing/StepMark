import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {auditRecordedBinaryItems} from "../src/item-quality-audit.ts";
/**
 * Pinned MaRs-IB 2023 validation study — standalone research; only aggregates
 * leave the ephemeral CI runner. Not the StepMark item bank, not a norm.
 * Source license: repository MIT; underlying research data/stimulus permissions
 * must be checked independently for any product redistribution.
 */
export const UPSTREAM={
  repository:"ndawlab/mars-irt",
  revision:"04eecdaf77d0ee657c65351eab5ed9e744b1ce14",
  path:"04_Validation/data/shortform/mars.csv",
  gitBlobSha1:"9742d6f7c13a44d146821d8c91b7fbb706a3efa6",
  paper:"https://doi.org/10.3758/s13428-023-02067-8",
  license:"MIT repository license; source data use research-only here"
};
const HEADER="subject,trial,item_set,short_form,item_id,item,distractor,shape_set,choice,accuracy,rt,all_loaded,minimum_resolution,browser_interactions";
const key=/^[a-zA-Z0-9_.:-]{1,128}$/;
export function parsePinnedMarsShortformCsv(raw){
  if(!Buffer.isBuffer(raw)||raw.length>600000||raw.length<100)throw new Error("SOURCE_SIZE");
  const lines=raw.toString("utf8").trim().split(/\r?\n/);
  if(lines.shift()!==HEADER)throw new Error("SOURCE_SCHEMA_CHANGED");
  if(lines.length>50000)throw new Error("SOURCE_ROWS_OVER_CAP");
  const rows=[];
  for(const line of lines){
    const a=line.split(",");
    if(a.length!==14||!key.test(a[0])||
       !/^[0-9]{1,3}$/.test(a[3])||!/^[0-9]{1,5}$/.test(a[4])||
       !["","NA","1.0","0.0"].includes(a[9])||
       (a[9]===""||a[9]==="NA")!== (a[10]===""||a[10]==="NA")||
       (a[10]!==""&&a[10]!=="NA"&&
         (!Number.isFinite(Number(a[10]))||Number(a[10])<=0||Number(a[10])>3600)))
      throw new Error("SOURCE_ROW_INVALID");
    // Keep raw participant identifiers only in RAM. Never log/write/persist.
    rows.push({
      personKey:a[0],formKey:"mars-short-"+a[3],itemKey:a[4],
      correct:a[9]===""||a[9]==="NA"?null:Number(a[9]),
      responseTimeMs:a[10]===""||a[10]==="NA"?null:Number(a[10])*1000
    });
  }
  if(!rows.length)throw new Error("SOURCE_EMPTY");
  return rows;
}
export function verifyGitBlob(data){
  const computed=createHash("sha1").update("blob "+data.length+"\0").update(data).digest("hex");
  if(computed!==UPSTREAM.gitBlobSha1)throw new Error("SOURCE_VERSION_MISMATCH");
  return createHash("sha256").update(data).digest("hex");
}
async function main(){
  if(process.argv.length!==3||process.argv[2]!=="--pinned-public-research")
    throw new Error("Usage: --pinned-public-research");
  const url="https://raw.githubusercontent.com/"+UPSTREAM.repository+"/"+UPSTREAM.revision+"/"+UPSTREAM.path;
  const response=await fetch(url,{signal:AbortSignal.timeout(25000),cache:"no-store"});
  if(!response.ok)throw new Error("SOURCE_HTTP_"+response.status);
  if(Number(response.headers.get("content-length")||0)>600000)throw new Error("SOURCE_OVERSIZED");
  const data=Buffer.from(await response.arrayBuffer());
  const sha256=verifyGitBlob(data);
  const rows=parsePinnedMarsShortformCsv(data);
  const audit=auditRecordedBinaryItems(rows);
  process.stdout.write(JSON.stringify({
    status:"real_data_descriptive_only",source:UPSTREAM,sourceSha256:sha256,
    audit,participantLevelRecordsPersisted:false,
    warning:"This is item-analysis of MaRs-IB short forms, not calibration/validation of the unrelated StepMark six-item logic forms. No demographic DIF, latent theta or general ability growth claims."
  },null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{process.stderr.write("MaRs-IB pinned research gate failed: "+e.message+"\n");process.exitCode=1;});
