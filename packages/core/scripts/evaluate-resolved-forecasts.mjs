/**
 * Local/offline research adapter. Never uploads an individual's predictions
 * and never prints event ids or row-level observations.
 * Usage: node --import tsx .../evaluate-resolved-forecasts.mjs --input file.csv --manifest manifest.json
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {auditResolvedForecasts} from "../src/forecast-calibration-audit.ts";
const HEADER="event_key,forecast_probability,reference_probability,outcome,forecast_at_ms,reference_at_ms,resolved_at_ms";
export function parseResolvedForecastCsv(buffer){
  if(!Buffer.isBuffer(buffer))throw new Error("INVALID_INPUT");
  if(buffer.length>3_000_000)throw new Error("FILE_TOO_LARGE");
  const lines=buffer.toString("utf8").trim().split(/\r?\n/);
  if(lines.shift()!==HEADER)throw new Error("SCHEMA_MISMATCH");
  if(lines.length>10000)throw new Error("TOO_MANY_EVENTS");
  const parsed=[];
  for(const line of lines){
    if(!line.trim())continue;
    const cols=line.split(",");
    if(cols.length!==7||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(cols[0]??"")||
      !cols.slice(1,3).every(x=>/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(x))||
      !/^[01]$/.test(cols[3]??"")||
      !cols.slice(4).every(x=>/^(?:0|[1-9]\d{0,15})$/.test(x)&&Number.isSafeInteger(Number(x))))
      throw new Error("INVALID_FORECAST_ROW");
    parsed.push({eventKey:cols[0],forecastProbability:Number(cols[1]),
      referenceProbability:Number(cols[2]),outcome:Number(cols[3]),
      forecastAtMs:Number(cols[4]),referenceAtMs:Number(cols[5]),
      resolvedAtMs:Number(cols[6])});
  }
  if(!parsed.length)throw new Error("NO_DATA");
  return parsed;
}
export function verifyForecastResearchManifest(manifest,digest){
  if(!manifest||manifest.rightsConfirmed!==true||
     typeof manifest.citation!=="string"||manifest.citation.length<10||
     typeof manifest.license!=="string"||manifest.license.length<2||
     typeof manifest.sourceUrl!=="string"||!/^https:\/\//.test(manifest.sourceUrl)||
     typeof manifest.sourceVersion!=="string"||!manifest.sourceVersion||
     typeof manifest.referencePolicyVersion!=="string"||
     !/^[a-zA-Z0-9._:-]{1,100}$/.test(manifest.referencePolicyVersion)||
     typeof manifest.sha256!=="string"||manifest.sha256.toLowerCase()!==digest)
    throw new Error("UNVERIFIED_RESEARCH_SOURCE_OR_RIGHTS");
  return {citation:manifest.citation,license:manifest.license,sourceUrl:manifest.sourceUrl,
    sourceVersion:manifest.sourceVersion,referencePolicyVersion:manifest.referencePolicyVersion,
    sha256:digest};
}
async function main(){
  if(process.argv.length!==6||process.argv[2]!=="--input"||process.argv[4]!=="--manifest")
    throw new Error("Usage: --input file.csv --manifest verified-rights.json");
  const [data,rights]=await Promise.all([readFile(process.argv[3]),readFile(process.argv[5],"utf8")]);
  if(data.length>3_000_000||rights.length>20_000)throw new Error("INPUT_TOO_LARGE");
  const digest=createHash("sha256").update(data).digest("hex");
  const manifest=verifyForecastResearchManifest(JSON.parse(rights),digest);
  const result=auditResolvedForecasts(parseResolvedForecastCsv(data),{
    referencePolicyVersion:manifest.referencePolicyVersion,nowMs:Date.now()
  });
  process.stdout.write(JSON.stringify({provenance:manifest,audit:result},null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{process.stderr.write("Forecast audit blocked: "+e.message+"\n");process.exitCode=1;});
