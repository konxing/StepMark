import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {parseResolvedForecastCsv,verifyForecastResearchManifest} from "./evaluate-resolved-forecasts.mjs";
const csv="event_key,forecast_probability,reference_probability,outcome,forecast_at_ms,reference_at_ms,resolved_at_ms\ne1,0.7,0.5,1,2000,1000,3000";
const digest=createHash("sha256").update(csv).digest("hex");
const rights={rightsConfirmed:true,citation:"Synthetic test example (not empirical)",
  sourceUrl:"https://example.org/research-data",sourceVersion:"test-v1",
  license:"synthetic",referencePolicyVersion:"fixed-v1",sha256:digest};
test("CSV parser is strict, no personal text and no misleading rounding",()=>{
  const rows=parseResolvedForecastCsv(Buffer.from(csv));
  assert.equal(rows.length,1);
  assert.equal(rows[0].forecastProbability,.7);
  assert.throws(()=>parseResolvedForecastCsv(Buffer.from(csv+"\ne2,2,0.5,1,2000,1000,3000")),/INVALID/);
  assert.throws(()=>parseResolvedForecastCsv(Buffer.from(csv.replace("e1,","Alice note,"))),/INVALID/);
});
test("source versions, declared rights and byte-for-byte integrity must match",()=>{
  assert.equal(verifyForecastResearchManifest(rights,digest).sha256,digest);
  assert.throws(()=>verifyForecastResearchManifest({...rights,rightsConfirmed:false},digest),/UNVERIFIED/);
  assert.throws(()=>verifyForecastResearchManifest(rights,"0".repeat(64)),/UNVERIFIED/);
  assert.throws(()=>verifyForecastResearchManifest({...rights,referencePolicyVersion:""},digest),/UNVERIFIED/);
});
