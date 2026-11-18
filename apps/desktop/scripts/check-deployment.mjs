#!/usr/bin/env node
// Read-only deployment preflight. No user credentials, writes, redirects,
// production secrets, or privileged endpoints. Non-zero exit means NOT READY.
import {lookup} from "node:dns/promises";
import {request} from "node:https";

const origin="https://stepmark.xin";
const hostname="stepmark.xin";
const timeoutMs=10000;

async function probe(path, expectedStatus, expectedCode) {
  return await new Promise((resolve,reject)=>{
    const req=request(origin+path,{
      method:"GET",timeout:timeoutMs,
      headers:{Accept:"application/json"},
      rejectUnauthorized:true,
      maxHeaderSize:16384
    },res=>{
      const chunks=[];
      let total=0;
      res.on("data",chunk=>{
        total+=chunk.length;
        if(total>32768){req.destroy(new Error("API response exceeded 32 KiB"));return;}
        chunks.push(chunk);
      });
      res.on("end",()=>{
        const status=res.statusCode;
        const contentType=String(res.headers["content-type"]??"");
        const location=res.headers.location;
        if(status!==expectedStatus || location || !contentType.startsWith("application/json")){
          reject(new Error(path+": unexpected status/content-type/redirect ("+status+", "+contentType+")"));
          return;
        }
        let body;
        try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
        catch{reject(new Error(path+": invalid JSON"));return;}
        if(body?.error?.code!==expectedCode){
          reject(new Error(path+": unexpected API error shape"));return;
        }
        resolve({path,status,code:body.error.code});
      });
    });
    req.on("timeout",()=>req.destroy(new Error("HTTPS timeout")));
    req.on("error",reject);
    req.end();
  });
}

try{
  const addresses=await lookup(hostname,{all:true});
  if(!addresses.length)throw new Error("No DNS address for "+hostname);
  console.log("DNS resolved:",hostname,"("+addresses.length+" address(es))");
  // A live unauthenticated StepMark API must refuse both endpoints. A static
  // landing page or a proxy returning 200 must not pass this preflight.
  for(const [path,status,code] of [
    ["/api/v1/me",401,"UNAUTHENTICATED"],
    ["/api/v1/habits",401,"UNAUTHENTICATED"]
  ]){
    const result=await probe(path,status,code);
    console.log("HTTPS/API ready:",result.path,result.status,result.code);
  }
  console.log("Public API preflight PASSED (not a login or installation E2E test)");
}catch(error){
  console.error("Public API NOT READY:",error instanceof Error?error.message:String(error));
  console.error("Buying a domain alone does not deploy the app, DNS, TLS or PostgreSQL.");
  process.exitCode=1;
}
