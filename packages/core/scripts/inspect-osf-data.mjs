import {createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";

/**
 * TEMPORARY research acquisition in isolated GitHub runner only.
 * Never print participant-level records, identifiers, raw text or secrets.
 * No committed data and no uploaded Actions artifacts.
 */
const projects=[
 {id:"sngu4",label:"Edgren daily decay",files:["Readme_DATA_INFO.txt","SRBAI_TS_141223.csv"]},
 {id:"zty5s",label:"Fiorella daily formation",files:["README.md","OSF_review_package.zip"]},
 {id:"b69gp",label:"Edgren study2",files:["Readme_QUANTI_DATA_INFO.txt"]}
];
async function json(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{Accept:"application/vnd.api+json"}});
  if(!r.ok)throw new Error("Metadata HTTP "+r.status);
  return r.json();
}
async function download(item){
  const url=new URL(item.links?.download??"");
  if(!["osf.io","files.osf.io","api.osf.io"].includes(url.hostname) ||
    url.protocol!=="https:")throw new Error("UNEXPECTED_OSF_DOWNLOAD_ORIGIN");
  const r=await fetch(url,{signal:AbortSignal.timeout(40000)});
  if(!r.ok)throw new Error("Download HTTP "+r.status);
  if(Number(r.headers.get("content-length")??0)>42_000_000)throw new Error("FILE_TOO_LARGE");
  const buffer=Buffer.from(await r.arrayBuffer());
  if(buffer.length>42_000_000)throw new Error("FILE_TOO_LARGE");
  const sha256=createHash("sha256").update(buffer).digest("hex");
  const expected=item.attributes?.extra?.hashes?.sha256;
  if(expected && expected.toLowerCase()!==sha256)throw new Error("DOWNLOAD_HASH_MISMATCH");
  return {buffer,sha256};
}
function dataShape(buffer){
  const source=buffer.toString("utf8");
  const first=source.split(/\r?\n/,1)[0]??"";
  const sep=first.includes("\t")?"\t":first.includes(";")?";":",";
  const columns=first.replace(/^\uFEFF/,"").split(sep).map(x=>x.trim().replace(/^"|"$/g,""));
  // Number of physical lines, not validated CSV rows (quoted newlines possible).
  const physicalLines=source.split(/\r?\n/).length;
  return {columns:columns.slice(0,70),columnCount:columns.length,
    physicalLines,possiblyQuotedNewlines:source.includes('"\n')};
}
for(const p of projects){
  try{
    const [node,list]=await Promise.all([
      json("https://api.osf.io/v2/nodes/"+p.id+"/"),
      json("https://api.osf.io/v2/nodes/"+p.id+"/files/osfstorage/")
    ]);
    const license=node?.data?.attributes?.license??null;
    process.stdout.write(JSON.stringify({project:p.id,title:p.label,
      projectLicense:license,filesListed:list.data?.length??0})+"\n");
    for(const fname of p.files){
      const item=(list.data??[]).find(x=>x.attributes?.name===fname);
      if(!item){process.stdout.write(JSON.stringify({project:p.id,file:fname,status:"not_found"})+"\n");continue;}
      try{
        const {buffer,sha256}=await download(item);
        const summary={project:p.id,file:fname,size:buffer.length,sha256,sourceFileId:item.id,
          providerHash:item.attributes?.extra?.hashes?.sha256??null};
        if(fname.endsWith(".csv"))Object.assign(summary,{dataShape:dataShape(buffer)});
        if(fname.toLowerCase().endsWith(".md")||fname.toLowerCase().endsWith(".txt"))
          Object.assign(summary,{readmeExcerpt:buffer.toString("utf8").slice(0,6000)});
        if(fname.endsWith(".zip")){
          const dir=await mkdtemp(join(tmpdir(),"stepmark-osf-"));
          try {
            const path=join(dir,"package.zip");await writeFile(path,buffer);
            const output=execFileSync("unzip",["-Z","-1",path],{encoding:"utf8",timeout:10000,maxBuffer:256000});
            const paths=output.trim().split(/\r?\n/);
            Object.assign(summary,{archiveEntries:paths.length,
              archivePaths:paths.slice(0,70),
              archiveTruncated:paths.length>70});
          }finally{await rm(dir,{recursive:true,force:true});}
        }
        process.stdout.write(JSON.stringify(summary)+"\n");
      }catch(err){
        process.stdout.write(JSON.stringify({project:p.id,file:fname,
          error:err instanceof Error?err.message:"UNKNOWN"})+"\n");
      }
    }
  }catch(err){
    process.stdout.write(JSON.stringify({project:p.id,
      error:err instanceof Error?err.message:"UNKNOWN"})+"\n");
  }
}
