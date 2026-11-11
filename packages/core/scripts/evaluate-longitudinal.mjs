/**
 * Offline, opt-in longitudinal research validator. Does not fetch, store or
 * send personal study data; prints only participant-aggregate results.
 *
 * Run:
 *   npm exec -- tsx packages/core/scripts/evaluate-longitudinal.mjs --input /path/to/data.csv --manifest /path/to/rights.json
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {evaluateAutomaticitySeries} from "../src/validation.ts";

const CSV_HEADER="participant_id,day,effective_repetitions,automaticity_0_100";
function positiveInteger(value){
  return /^(0|[1-9][0-9]{0,7})$/.test(value) && Number.isSafeInteger(Number(value));
}
export function parseStudyCsv(text){
  if(Buffer.byteLength(text,"utf8")>20_000_000)throw new Error("FILE_TOO_LARGE");
  const lines=text.trim().split(/\r?\n/);
  if(lines.shift()?.trim()!==CSV_HEADER)throw new Error("INCOMPATIBLE_SCHEMA");
  if(lines.length>150000)throw new Error("TOO_MANY_ROWS");
  const rows=[];
  for(const line of lines){
    if(!line.trim())continue;
    const c=line.split(",");
    if(c.length!==4||!(/^[a-zA-Z0-9_.:-]{1,100}$/.test(c[0]||""))||
       !positiveInteger(c[1]||"")||!positiveInteger(c[2]||"")||
       (c[3]!==""&&(!/^(?:\d{1,3})(?:\.\d{1,8})?$/.test(c[3]||"") ||
        Number(c[3])>100)))throw new Error("INVALID_STUDY_ROW");
    rows.push({participantId:c[0],day:Number(c[1]),effectiveRepetitions:Number(c[2]),
      automaticity:c[3]===""?null:Number(c[3])});
  }
  if(!rows.length)throw new Error("EMPTY_DATASET");
  return rows;
}
export function checkStudyRights(manifest, actualSha256){
  if(!manifest||typeof manifest!=="object"||
     manifest.reusePermissionConfirmed!==true||
     typeof manifest.license!=="string"||manifest.license.length<2||
     typeof manifest.citation!=="string"||manifest.citation.length<8||
     typeof manifest.sourceUrl!=="string"||!/^https:\/\//.test(manifest.sourceUrl)||
     typeof manifest.sourceVersion!=="string"||!manifest.sourceVersion||
     typeof manifest.automaticityMeasure!=="string"||manifest.automaticityMeasure.length<6||
     typeof manifest.sha256!=="string"||manifest.sha256.toLowerCase()!==actualSha256){
    throw new Error("UNVERIFIED_SOURCE_RIGHTS_OR_CHECKSUM");
  }
  if(manifest.automaticityIndependentOfPredictions!==true)
    throw new Error("AUTOMATICITY_TARGET_NOT_INDEPENDENT");
  return {citation:manifest.citation,license:manifest.license,
    sourceUrl:manifest.sourceUrl,sourceVersion:manifest.sourceVersion,
    automaticityMeasure:manifest.automaticityMeasure,sha256:actualSha256};
}
async function main(){
  if(process.argv.length!==6||process.argv[2]!=="--input"||process.argv[4]!=="--manifest")
    throw new Error("Usage: ... --input dataset.csv --manifest license-and-source.json");
  const [file,manifestText]=await Promise.all([
    readFile(process.argv[3]),
    readFile(process.argv[5],"utf8")
  ]);
  if(file.length>20_000_000||manifestText.length>20_000)throw new Error("INPUT_TOO_LARGE");
  const digest=createHash("sha256").update(file).digest("hex");
  const manifest=JSON.parse(manifestText);
  const provenance=checkStudyRights(manifest,digest);
  const records=parseStudyCsv(file.toString("utf8"));
  const evaluation=evaluateAutomaticitySeries(records);
  if(evaluation.quality.evaluatedParticipants<10){
    throw new Error("INSUFFICIENT_PERSON_TIME_SERIES: require >=10 eligible independent people before claiming model comparison");
  }
  process.stdout.write(JSON.stringify({provenance,evaluation},null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{process.stderr.write("Longitudinal validation could not proceed: "+e.message+"\n");process.exitCode=1;});
}
