import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {auditRecordedBinaryItems} from "../src/item-quality-audit.ts";
import {evaluateHeldoutItemRates} from "../src/research-item-holdout.ts";
import {evaluateResearchDatasetRights} from "../src/research-dataset-rights.ts";
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
         (!Number.isFinite(Number(a[10]))||Number(a[10])<=0||Number(a[10])>3600))||
       !["0","1"].includes(a[11])||
       !["0","1"].includes(a[12])||
       !/^(?:0|[1-9][0-9]*)(?:\.0)?$/.test(a[13])||
       Number(a[13])>1000)
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
/**
 * Capture operational factors before studying response time. These flags do
 * not automatically mean a participant is invalid, and are not a device
 * calibration. Never print participants, browser strings or raw records.
 */
export function summarizeMarsTechnicalQuality(raw){
  const body=raw.toString("utf8").trim().split(/\r?\n/);
  if(body.shift()!==HEADER||body.length>50000)throw new Error("SOURCE_SCHEMA_CHANGED");
  let incompleteLoad=0,lowResolution=0,interactionRows=0;
  for(const line of body){
    const a=line.split(",");
    if(a.length!==14||!["0","1"].includes(a[11])||
       !["0","1"].includes(a[12])||
       !/^(?:0|[1-9][0-9]*)(?:\.0)?$/.test(a[13])||
       Number(a[13])>1000)throw new Error("SOURCE_TECHNICAL_FLAGS_INVALID");
    if(a[11]==="0")incompleteLoad++;
    if(a[12]==="0")lowResolution++;
    if(Number(a[13])>0)interactionRows++;
  }
  return {recordedRows:body.length,allLoadedFalseRows:incompleteLoad,
    minimumResolutionFalseRows:lowResolution,nonzeroBrowserInteractionsRows:interactionRows,
    caution:"Technical flags can confound latency and missingness; report them instead of ignoring them. They do not certify clock precision or device comparability."};
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
  const rightsManifest={
    datasetId:"mars-ib-shortform-2023",sourceUrl:"https://github.com/ndawlab/mars-irt",
    sourceVersion:UPSTREAM.revision,retrievedOn:"2026-11-16",
    licenseId:"MIT scoped to archived repository's validation CSV",
    licenseUrl:"https://github.com/ndawlab/mars-irt/blob/"+UPSTREAM.revision+"/LICENSE",
    rightsVerified:true,access:"open",evidence:"checksum_verified",
    sha256:"eb22235965b5e331e7376f113edbb0bd09be6ddc3bc03f75460e691684cbf6d5",
    participantLevel:true,itemLevel:true,longitudinal:false,
    population:"Adult online reasoning validation sample",language:"nonverbal",
    permissions:{localNoncommercialResearch:"allowed",commercialProduct:"unverified",
      rawRedistribution:"prohibited",aggregatePublication:"allowed"},
    notes:"Scoped to read-only, ephemeral noncommercial source CSV analysis. MIT repository license does not grant unrestricted rights to separate stimuli, third-party content or commercial participant-data training."
  };
  const localRights=evaluateResearchDatasetRights(rightsManifest,{
    kind:"local_analysis",actualSha256:sha256,isolated:true,termsAccepted:false});
  if(!localRights.allowed)throw new Error("SOURCE_RIGHTS_GATE_BLOCKED");
  const publishRights=evaluateResearchDatasetRights(rightsManifest,{
    kind:"publish_aggregates",minCellSize:10,containsParticipantRows:false});
  if(!publishRights.allowed)throw new Error("SOURCE_AGGREGATE_PUBLICATION_BLOCKED");
  const rows=parsePinnedMarsShortformCsv(data);
  const audit=auditRecordedBinaryItems(rows);
  const personHeldout=evaluateHeldoutItemRates(rows);
  const technicalQuality=summarizeMarsTechnicalQuality(data);
  process.stdout.write(JSON.stringify({
    status:"real_data_descriptive_only",source:UPSTREAM,sourceSha256:sha256,
    audit,technicalQuality,personHeldout,
    provenanceGate:{localResearchAllowed:localRights.allowed,aggregatePublicationAllowed:publishRights.allowed,
      commercialProductAllowed:evaluateResearchDatasetRights(rightsManifest,{kind:"commercial_product"}).allowed,
      rawRedistributionAllowed:evaluateResearchDatasetRights(rightsManifest,{kind:"redistribute_raw"}).allowed},
    participantLevelRecordsPersisted:false,
    warning:"This is item-analysis of MaRs-IB short forms, not calibration/validation of the unrelated StepMark six-item logic forms. No demographic DIF, latent theta or general ability growth claims."
  },null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{process.stderr.write("MaRs-IB pinned research gate failed: "+e.message+"\n");process.exitCode=1;});
