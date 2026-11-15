import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchDatasetRights, researchSourceCandidates,
  type ResearchDatasetManifest} from "../src/research-dataset-rights.ts";
const digest="a".repeat(64);
const base:ResearchDatasetManifest={datasetId:"synthetic-test-data",sourceUrl:"https://example.org/data",
  sourceVersion:"v1-pin",retrievedOn:"2026-11-15",licenseId:"CC0-1.0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",
  rightsVerified:true,access:"open",evidence:"checksum_verified",sha256:digest,
  participantLevel:true,itemLevel:true,longitudinal:false,population:"synthetic",language:"n/a",notes:"unit-test-only",
  permissions:{localNoncommercialResearch:"allowed",commercialProduct:"unverified",rawRedistribution:"prohibited",aggregatePublication:"allowed"}};
const local={kind:"local_analysis" as const,actualSha256:digest,isolated:true,termsAccepted:false};
test("research dataset usage requires byte-pinned isolated environment",()=>{
  assert.equal(evaluateResearchDatasetRights(base,local).allowed,true);
  assert.equal(evaluateResearchDatasetRights(base,{...local,actualSha256:"0".repeat(64)}).allowed,false);
  assert.equal(evaluateResearchDatasetRights(base,{...local,isolated:false}).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,evidence:"metadata_only",sha256:null},local).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,rightsVerified:false},local).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,evidence:"metadata_only",sha256:null},{kind:"commercial_product"}).allowed,false);
});
test("terms-required access blocks analysis until accepted, regardless of open metadata",()=>{
  const m={...base,access:"terms_required" as const};
  assert.equal(evaluateResearchDatasetRights(m,local).allowed,false);
  assert.equal(evaluateResearchDatasetRights(m,{...local,termsAccepted:true}).allowed,true);
  assert.equal(evaluateResearchDatasetRights({...base,access:"unknown"},local).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,access:"restricted"},local).allowed,false);
});
test("unknown or prohibited rights cannot become commercial or redistributable by default",()=>{
  for(const kind of ["redistribute_raw","commercial_product"] as const){
    assert.equal(evaluateResearchDatasetRights(base,{kind}).allowed,false);
  }
  const m={...base,permissions:{...base.permissions,localNoncommercialResearch:"unverified" as const}};
  assert.equal(evaluateResearchDatasetRights(m,local).allowed,false);
});
test("aggregate outputs require rights and minimum cell suppression",()=>{
  assert.equal(evaluateResearchDatasetRights(base,{kind:"publish_aggregates",minCellSize:10,containsParticipantRows:false}).allowed,true);
  for(const minCellSize of [0,4,9,NaN,12.5])
    assert.equal(evaluateResearchDatasetRights(base,{kind:"publish_aggregates",minCellSize,containsParticipantRows:false}).allowed,false);
  assert.equal(evaluateResearchDatasetRights(base,{kind:"publish_aggregates",minCellSize:100,containsParticipantRows:true}).allowed,false);
});
test("incomplete and malformed manifests fail closed even for metadata",()=>{
  assert.equal(evaluateResearchDatasetRights({...base,sourceVersion:""},{kind:"inspect_metadata"}).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,sha256:"BAD"},local).allowed,false);
  assert.equal(evaluateResearchDatasetRights({...base,licenseUrl:"http://example.org"},local).allowed,false);
  assert.equal(evaluateResearchDatasetRights(base,{kind:"inspect_metadata"}).allowed,true);
});
test("source catalog is metadata-only; has no participant records or invented checksum",()=>{
  assert.ok(researchSourceCandidates.length>=7);
  assert.ok(researchSourceCandidates.every(d=>d.evidence==="metadata_only"));
  assert.ok(researchSourceCandidates.some(d=>d.datasetId==="piaac-cycle2"&&d.access==="terms_required"));
  assert.ok(researchSourceCandidates.some(d=>d.datasetId==="attention-control-2026"&&d.access==="unknown"));
});
