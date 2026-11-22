import pg from "pg";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";

/** Delete expired authentication and replay-control metadata, not habits or assessments.
 * The SQL is fixed and parameterized; return only aggregate counts.
 */
export async function pruneExpired(pool,now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new RangeError("invalid time");
  const client=await pool.connect();
  const day=86400000;
  const older=new Date(now.getTime()-7*day);
  const receiptCutoff=new Date(now.getTime()-30*day);
  let committed=false;
  try{
    await client.query("BEGIN");
    const counts={};
    for(const [key,query,cutoff] of [
      ["rateLimitBuckets",'DELETE FROM "RateLimitBucket" WHERE "expiresAt" < $1',now],
      ["loginCodes",'DELETE FROM "LoginCode" WHERE "expiresAt" < $1',now],
      ["expiredTokens",'DELETE FROM "VerificationToken" WHERE "expiresAt" < $1',older],
      ["oldSessions",'DELETE FROM "Session" WHERE "expiresAt" < $1 OR "revokedAt" < $1',older],
      ["expiredAssistantReceipts",'DELETE FROM "AssistantAction" WHERE "createdAt" < $1',receiptCutoff]
    ]){
      const result=await client.query(query,[cutoff]);
      counts[key]=result.rowCount;
    }
    await client.query("COMMIT");
    committed=true;
    return counts;
  }catch(error){
    if(!committed){try{await client.query("ROLLBACK");}catch{/* original failure */}}
    throw error;
  }finally{client.release();}
}
function makePool(){
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)throw new Error("DATABASE_URL required for retention cleanup");
  return new pg.Pool({connectionString,max:2,connectionTimeoutMillis:3000,
    idleTimeoutMillis:10000,query_timeout:15000});
}
async function main(){
  const pool=makePool(),loop=process.argv.includes("--loop");
  const controller=new AbortController();
  const stop=()=>controller.abort();
  process.once("SIGTERM",stop);
  process.once("SIGINT",stop);
  try{
    while(!controller.signal.aborted){
      let wait=24*60*60*1000;
      try{
        const result=await pruneExpired(pool);
        process.stdout.write(JSON.stringify({job:"retention_cleanup",...result})+"\n");
      }catch{
        process.stderr.write("Retention cleanup failed; retry in 15 minutes.\n");
        if(!loop){process.exitCode=1;break;}
        wait=15*60*1000;
      }
      if(!loop)break;
      try{await delay(wait,undefined,{signal:controller.signal});}
      catch(error){if(error?.name!=="AbortError")throw error;}
    }
  }finally{
    process.removeListener("SIGTERM",stop);
    process.removeListener("SIGINT",stop);
    await pool.end();
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(()=>{process.stderr.write("Retention cleanup unavailable.\n");process.exitCode=1;});
}
