/**
 * Non-destructive local smoke benchmark using only Node 22+ built-in fetch.
 * Not a production SLA measurement or a load-testing replacement.
 */
const base=process.env.BASE_URL||"http://localhost:3000";
const url=new URL(base);
if(!(url.hostname==="localhost"||url.hostname==="127.0.0.1")||
   (url.protocol!=="http:"&&url.protocol!=="https:")){
  throw new Error("Benchmark restricted to localhost");
}
const total=180,concurrency=9;
const latency=[],errors=[];
let cursor=0;
async function worker(){
  while(cursor<total){
    const i=cursor++;
    const path=i%4===0?"/api/health":"/api/v1/catalog";
    const start=performance.now();
    try{
      const r=await fetch(url.origin+path,{signal:AbortSignal.timeout(3000),cache:"no-store"});
      await r.arrayBuffer();
      latency.push(performance.now()-start);
      if(!r.ok)errors.push({status:r.status,path});
    }catch(e){errors.push({path,error:String(e)});}
  }
}
await Promise.all(Array.from({length:concurrency},()=>worker()));
const sorted=latency.sort((a,b)=>a-b);
const quantile=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]??null;
const metrics={requests:total,concurrency,successful:latency.length,failed:errors.length,
  p50Ms:quantile(.5),p95Ms:quantile(.95),p99Ms:quantile(.99)};
process.stdout.write(JSON.stringify(metrics,null,2)+"\n");
if(errors.length)process.exitCode=1;
