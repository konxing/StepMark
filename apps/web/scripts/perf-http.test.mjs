import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("./perf-http.mjs",import.meta.url));
function probe(baseUrl){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script],{
      env:{...process.env,BASE_URL:baseUrl},stdio:["ignore","pipe","pipe"]
    });
    let stdout="",stderr="";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data",part=>stdout+=part);
    child.stderr.on("data",part=>stderr+=part);
    child.on("error",reject);
    child.on("close",code=>resolve({code,stdout,stderr}));
  });
}
async function withServer(statusForPath,run){
  const server=createServer((req,res)=>{
    const status=statusForPath(req.url??"/");
    res.writeHead(status,{"Content-Type":"application/json"});
    res.end(JSON.stringify({status}));
  });
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  try{
    const addr=server.address();
    assert.ok(addr && typeof addr==="object");
    return await run("http://127.0.0.1:"+addr.port);
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}

test("healthy localhost requests are counted as successful latency samples",async()=>{
  await withServer(()=>200,async base=>{
    const result=await probe(base);
    assert.equal(result.code,0,result.stderr);
    const metrics=JSON.parse(result.stdout);
    assert.equal(metrics.requests,180);
    assert.equal(metrics.successful,180);
    assert.equal(metrics.failed,0);
    assert.ok(metrics.p95Ms!==null && metrics.p99Ms!==null);
  });
});

test("HTTP 503 failures never inflate successful count or p95/p99",async()=>{
  await withServer(path=>path==="/api/health"?200:503,async base=>{
    const result=await probe(base);
    assert.equal(result.code,1);
    const metrics=JSON.parse(result.stdout);
    assert.equal(metrics.successful,45);
    assert.equal(metrics.failed,135);
    assert.ok(metrics.p95Ms!==null);
  });
  await withServer(()=>503,async base=>{
    const result=await probe(base);
    assert.equal(result.code,1);
    const metrics=JSON.parse(result.stdout);
    assert.equal(metrics.successful,0);
    assert.equal(metrics.failed,180);
    assert.equal(metrics.p95Ms,null);
    assert.equal(metrics.p99Ms,null);
  });
});

test("performance probe refuses to send requests to a remote host",async()=>{
  const result=await probe("https://example.com");
  assert.notEqual(result.code,0);
  assert.match(result.stderr,/Benchmark restricted to localhost/);
});
