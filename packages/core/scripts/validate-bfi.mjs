/**
 * Research-only psychometric smoke benchmark on a public demonstration cohort.
 * Source: R psych::bfi (SAPA, 2,800 respondents x 25 IPIP personality items).
 * Not cognitive ability, not automaticity, not validated StepMark norms.
 * The public response data is fetched ephemerally from a pinned Rdatasets mirror;
 * no raw participant rows are written into this repository or production DB.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
export const SOURCE=Object.freeze({
  project:"https://cran.r-project.org/package=psych",
  data:"psych::bfi (SAPA demonstration data, 2,800 respondents)",
  mirrorRepository:"vincentarelbundock/Rdatasets",
  mirrorCommit:"1dcc2bf5f955cc1224a3e1307256e1fe86b68dae",
  relativePath:"csv/psych/bfi.csv",
  blobSha:"8bc0e5ed94c7e399acfec48b1ebc50f16054b4af",
  description:"IPIP Big Five self-report only, NOT reasoning test results"
});
const SCALES=Object.freeze(["A","C","E","N","O"]);
const KEYS=Object.freeze(SCALES.flatMap(group=>
  Array.from({length:5},(_,i)=>group+(i+1))));
const REVERSE=new Set(["A1","C4","C5","E1","E2","O2","O5"]);
const HEADER=["rownames",...KEYS,"gender","education","age"].join(",");
export function blobSha(bytes){
  const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes,"utf8");
  return createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
}
function round(value){return Number(value.toFixed(4));}
export function parseBfiCsv(input,{verifyPinned=false}={}){
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input,"utf8");
  if(bytes.length>200_000)throw new Error("FILE_TOO_LARGE");
  if(verifyPinned && blobSha(bytes)!==SOURCE.blobSha)
    throw new Error("PINNED_BFI_SOURCE_CHECKSUM_MISMATCH");
  const lines=bytes.toString("utf8").trim().split(/\r?\n/);
  if(lines.shift()!==HEADER)throw new Error("BFI_SCHEMA_MISMATCH");
  if(lines.length>3000)throw new Error("TOO_MANY_BFI_ROWS");
  const data=[],ids=new Set();
  for(const line of lines){
    if(!line.trim())continue;
    const cols=line.split(",");
    if(cols.length!==29||!/^\d{1,10}$/.test(cols[0]||"")||ids.has(cols[0]))
      throw new Error("INVALID_OR_DUPLICATE_BFI_ROW");
    ids.add(cols[0]);
    const row=[];
    for(let j=1;j<=25;j++){
      const raw=cols[j];
      if(raw===""){row.push(null);continue;}
      if(!/^[1-6]$/.test(raw))throw new Error("INVALID_BFI_RESPONSE");
      row.push(Number(raw));
    }
    data.push(row);
  }
  if(!data.length)throw new Error("EMPTY_BFI_DATA");
  return data;
}
function variance(data){
 const mean=data.reduce((sum,v)=>sum+v,0)/data.length;
 return data.reduce((sum,v)=>sum+(v-mean)*(v-mean),0)/(data.length-1);
}
function correlation(x,y){
 const xm=x.reduce((s,v)=>s+v,0)/x.length,ym=y.reduce((s,v)=>s+v,0)/y.length;
 let cross=0,xx=0,yy=0;
 for(let i=0;i<x.length;i++){
  const a=x[i]-xm,b=y[i]-ym;
  cross+=a*b;xx+=a*a;yy+=b*b;
 }
 return xx>0&&yy>0?cross/Math.sqrt(xx*yy):null;
}
/** Cronbach's raw alpha with *listwise* complete cases and correct reverse keys:
 * alpha = k/(k-1) * [1 - sum(item variances)/variance(sum items)].
 * This is an internal-consistency diagnostic under strong assumptions (not validity).
 */
export function diagnoseScale(rows,scale,{minComplete=10}={}){
 if(!SCALES.includes(scale)||!Number.isInteger(minComplete)||minComplete<3)
  throw new Error("INVALID_SCALE_CONFIGURATION");
 const start=KEYS.indexOf(scale+"1");
 const itemKeys=KEYS.slice(start,start+5);
 const normalized=[];
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==25)throw new Error("INVALID_ROW_WIDTH");
  const values=[];
  for(let j=0;j<5;j++){
   const score=row[start+j];
   if(score===null){values.length=0;break;}
   if(!Number.isInteger(score)||score<1||score>6)throw new Error("INVALID_SCALE_VALUE");
   values.push(REVERSE.has(itemKeys[j])?7-score:score);
  }
  if(values.length===5)normalized.push(values);
 }
 if(normalized.length<minComplete)
  return {scale,total:rows.length,complete:normalized.length,missing:rows.length-normalized.length,
    rawAlpha:null,minCorrectedItemTotal:null,status:"insufficient_complete_cases"};
 const columns=Array.from({length:5},(_,j)=>normalized.map(row=>row[j]));
 const sums=normalized.map(row=>row.reduce((s,v)=>s+v,0));
 const sumVariance=variance(sums);
 if(sumVariance<=0)return {scale,total:rows.length,complete:normalized.length,
  missing:rows.length-normalized.length,rawAlpha:null,minCorrectedItemTotal:null,
  status:"zero_total_variance"};
 const alpha=5/4*(1-columns.reduce((s,c)=>s+variance(c),0)/sumVariance);
 const corrected=columns.map((col,j)=>{
   const without=normalized.map(row=>row.reduce((s,v,i)=>s+(i===j?0:v),0));
   return correlation(col,without);
 }).filter(v=>v!==null);
 return {scale,total:rows.length,complete:normalized.length,
  missing:rows.length-normalized.length,
  rawAlpha:round(alpha),minCorrectedItemTotal:corrected.length===5?round(Math.min(...corrected)):null,
  status:"descriptive_internal_consistency"};
}
export function benchmarkBfi(input,{verifyPinned=false}={}){
 const records=parseBfiCsv(input,{verifyPinned});
 if(verifyPinned && records.length!==2800)throw new Error("PINNED_BFI_ROW_COUNT_CHANGED");
 return {status:"external_descriptive_psychometrics_only",source:SOURCE.data,
   sourceCommit:SOURCE.mirrorCommit,sourceBlobSha:blobSha(input),
   participants:records.length,
   scales:SCALES.map(scale=>diagnoseScale(records,scale)),
   interpretation:"Public IPIP Big Five self-reports demonstrate raw-alpha and " +
    "missing-data calculations. Alpha is not construct validity or norming. " +
    "Personality responses are not cognitive ability, automaticity, or StepMark form calibration."};
}
async function main(){
 let bytes;
 if(process.argv.length===4 && process.argv[2]==="--input"){
  bytes=await readFile(process.argv[3]);
 }else if(process.argv.length===2){
  const url="https://raw.githubusercontent.com/"+SOURCE.mirrorRepository+"/"+
   SOURCE.mirrorCommit+"/"+SOURCE.relativePath;
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("BFI_SOURCE_UNAVAILABLE_"+response.status);
  const declared=Number(response.headers.get("content-length")??"0");
  if(declared>200000)throw new Error("FILE_TOO_LARGE");
  bytes=Buffer.from(await response.arrayBuffer());
 }else throw new Error("Usage: node validate-bfi.mjs [--input pinned-bfi.csv]");
 const result=benchmarkBfi(bytes,{verifyPinned:true});
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{process.stderr.write("BFI benchmark blocked: "+error.message+"\n");process.exitCode=1;});
}
