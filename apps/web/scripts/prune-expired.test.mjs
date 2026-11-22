import {test} from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {pruneExpired} from "./prune-expired.mjs";

test("retention cleanup deletes only expired metadata, not future login and rate-limit records",async t=>{
  if(!process.env.DATABASE_URL){t.skip("requires migrated test PostgreSQL");return;}
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,
    connectionTimeoutMillis:3000});
  const makeKey=()=>randomBytes(32).toString("hex");
  const oldBucket=makeKey(),newBucket=makeKey();
  const oldCode=makeKey(),newCode=makeKey();
  const now=new Date(),before=new Date(now.getTime()-86400000),
    after=new Date(now.getTime()+86400000);
  try{
    for(const [key,date] of [[oldBucket,before],[newBucket,after]]){
      await pool.query('INSERT INTO "RateLimitBucket" ("key","hits","expiresAt") VALUES ($1,1,$2)',[key,date]);
    }
    for(const [key,date] of [[oldCode,before],[newCode,after]]){
      await pool.query('INSERT INTO "LoginCode" ("codeHash","expiresAt") VALUES ($1,$2)',[key,date]);
    }
    const result=await pruneExpired(pool,now);
    assert.ok(result.rateLimitBuckets>=1);
    assert.ok(result.loginCodes>=1);
    assert.equal((await pool.query('SELECT "key" FROM "RateLimitBucket" WHERE "key"=$1',[oldBucket])).rowCount,0);
    assert.equal((await pool.query('SELECT "key" FROM "RateLimitBucket" WHERE "key"=$1',[newBucket])).rowCount,1);
    assert.equal((await pool.query('SELECT "codeHash" FROM "LoginCode" WHERE "codeHash"=$1',[oldCode])).rowCount,0);
    assert.equal((await pool.query('SELECT "codeHash" FROM "LoginCode" WHERE "codeHash"=$1',[newCode])).rowCount,1);
    assert.ok(Object.hasOwn(result,"expiredAssistantReceipts"));
    assert.equal((await pruneExpired(pool,now)).rateLimitBuckets,0);
  }finally{
    await pool.query('DELETE FROM "RateLimitBucket" WHERE "key"=ANY($1::text[])',[[oldBucket,newBucket]]).catch(()=>{});
    await pool.query('DELETE FROM "LoginCode" WHERE "codeHash"=ANY($1::text[])',[[oldCode,newCode]]).catch(()=>{});
    await pool.end();
  }
});
