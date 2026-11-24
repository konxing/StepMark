import pg from "pg";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

/** A private, one-shot production DB readiness probe, never a public API. */
export async function checkDatabase(connectionString=process.env.DATABASE_URL){
  if(!connectionString)throw new Error("DATABASE_URL is missing");
  const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:3000,
    idleTimeoutMillis:1000,query_timeout:5000});
  try{
    // LIMIT 0 checks table existence and runtime SELECT permission without
    // reading user data or causing a full-table count/scan.
    await pool.query('SELECT 1 FROM "User" LIMIT 0');
    await pool.query('SELECT 1 FROM "HabitEvent" LIMIT 0');
    await pool.query('SELECT 1 FROM "GrowthPractice" LIMIT 0');
    await pool.query('SELECT 1 FROM "WorkEvidence" LIMIT 0');
    await pool.query('SELECT 1 FROM "RateLimitBucket" LIMIT 0');
  }finally{await pool.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  checkDatabase().then(()=>process.stdout.write("Database readiness check passed.\n"),
    ()=>{process.stderr.write("Database readiness check failed (connection, schema or privileges).\n");process.exitCode=1;});
}
