import {test} from "node:test";
import assert from "node:assert/strict";
import {generateOracleIRT,benchmarkOracle2PL,auditAnchorMatchedDIF,auditCommonPersonForms,
  exploratoryPracticeAdjustedRCI,type OracleTrial,type StratifiedResponse,type PairedForm} from "../src/research-psychometrics.ts";
const design=[
  {key:"i0",discrimination:0.75,difficulty:-0.7},
  {key:"i1",discrimination:1.5,difficulty:0.1},
  {key:"i2",discrimination:2,difficulty:0.8},
  {key:"i3",discrimination:0.9,difficulty:1.2}
];
test("deterministic oracle 2PL recovers parameters with untouched person-level holdout",()=>{
  const rows=generateOracleIRT(10041,2400,design);
  assert.deepEqual(rows,generateOracleIRT(10041,2400,design));
  const r=benchmarkOracle2PL(rows,design);
  assert.equal(r.kind,"synthetic_oracle_parameter_recovery_v1");
  assert.equal(r.status,"research_simulation_only");
  assert.equal(r.trainingPeople+r.holdoutPeople,2400);
  assert.equal(r.trainingRows+r.holdoutRows,2400*design.length);
  assert.ok(r.holdoutPeople>250 && r.trainingPeople>1500);
  assert.ok(r.candidateItems.every(v=>v.fitStatus==="fitted"));
  assert.ok(r.metrics.discriminationRMSE!==null && r.metrics.discriminationRMSE<0.45);
  assert.ok(r.metrics.difficultyRMSE!==null && r.metrics.difficultyRMSE<0.5);
  assert.ok(r.metrics.twoPlBrier!==null && r.metrics.twoPlBrier < r.metrics.constantBrier);
  assert.ok(r.metrics.twoPlLogLoss!==null && r.metrics.twoPlLogLoss < r.metrics.constantLogLoss);
});
test("oracle benchmark order-invariant and rejects duplicate or inconsistent truth",()=>{
  const rows=generateOracleIRT(87531,300,design);
  assert.deepEqual(benchmarkOracle2PL(rows,design),benchmarkOracle2PL([...rows].reverse(),design));
  assert.throws(()=>benchmarkOracle2PL([...rows,rows[0]!],design),/duplicate/);
  assert.throws(()=>benchmarkOracle2PL([...rows.slice(0,1),{...rows[1]!,personKey:rows[0]!.personKey,knownTheta:99},...rows.slice(2)],design),/invalid/);
  assert.throws(()=>generateOracleIRT(0,100,design),/design/);
  assert.throws(()=>generateOracleIRT(123,100,[design[0]!,design[0]!]),/design/);
  assert.throws(()=>benchmarkOracle2PL([{personKey:"p",itemKey:"i0",knownTheta:0,correct:1} as OracleTrial],design),/size/);
});
function makeDifData(n=500, biased=false):StratifiedResponse[]{
  const rows:StratifiedResponse[]=[];
  // Score strata are balanced within each group; target is generated independently
  // of group except when intentionally injecting large simulated DIF.
  for(let i=0;i<n;i++){
    const group=i%2===0?"reference":"focal";
    const score=(Math.floor(i/2)%4);
    const target=biased?(group==="reference"?1:0):((Math.floor(i/8)%2) as 0|1);
    for(let j=0;j<4;j++)rows.push({personKey:`p${i}`,itemKey:`anchor${j}`,group,correct:j<score?1:0});
    rows.push({personKey:`p${i}`,itemKey:"target",group,correct:target});
  }
  return rows;
}
test("MH matching excludes target from anchor and reports only exploratory ratio",()=>{
  const rows=makeDifData(600,false);
  const r=auditAnchorMatchedDIF(rows,"target",["anchor0","anchor1","anchor2","anchor3"]);
  assert.equal(r.status,"descriptive_only");
  assert.ok(r.oddsRatioReferenceVsFocal!==null && Math.abs(r.oddsRatioReferenceVsFocal-1)<0.2);
  assert.equal(r.referencePeople,300);assert.equal(r.focalPeople,300);
  assert.throws(()=>auditAnchorMatchedDIF(rows,"target",["target","anchor0","anchor1"]),/anchor/);
});
test("MH returns insufficient when perfect separation, missing anchors, too few people",()=>{
  const rows=makeDifData(400,true);
  const r=auditAnchorMatchedDIF(rows,"target",["anchor0","anchor1","anchor2","anchor3"]);
  assert.equal(r.status,"insufficient_evidence");assert.equal(r.oddsRatioReferenceVsFocal,null);
  const missing=makeDifData(60,false).map(x=>x.itemKey==="anchor2"?{...x,correct:null}:x);
  const m=auditAnchorMatchedDIF(missing,"target",["anchor0","anchor1","anchor2","anchor3"]);
  assert.equal(m.referencePeople,0);assert.equal(m.excludedPeople,60);
  assert.throws(()=>auditAnchorMatchedDIF([...rows,rows[0]!],"target",["anchor0","anchor1","anchor2","anchor3"]),/duplicate/);
});
test("common-person A/B contrast keeps both randomized sequences separate, no linking claim",()=>{
  const rows:PairedForm[]=[];
  for(let i=0;i<120;i++){
    const personKey=`p${i}`,sequence=i%2?"A_B" as const:"B_A" as const;
    rows.push({personKey,form:"A",sequence,fractionCorrect:0.5});
    rows.push({personKey,form:"B",sequence,fractionCorrect:0.65});
  }
  const r=auditCommonPersonForms(rows);
  assert.equal(r.status,"descriptive_only");assert.equal(r.pairedPeople,120);
  assert.equal(r.meanBMinusA,0.15);
  assert.deepEqual(r.meanBMinusABySequence,{AB:0.15,BA:0.15});
  assert.equal(auditCommonPersonForms(rows.filter(x=>x.sequence==="A_B")).status,"insufficient_evidence");
  assert.throws(()=>auditCommonPersonForms([...rows,rows[0]!]),/duplicate/);
});
test("RCI uses independent retest reliability and practice correction, refuses invented assumptions",()=>{
  const r=exploratoryPracticeAdjustedRCI({baseline:50,followup:55,baselineSD:10,retestReliability:0.75,
    expectedPracticeGain:3,evidence:"independent_retest_study"});
  assert.equal(r.kind,"research_rci_only");
  assert.equal(r.practiceAdjustedDelta,2);
  assert.ok(Math.abs(r.z-0.282843)<1e-5);
  assert.throws(()=>exploratoryPracticeAdjustedRCI({baseline:50,followup:55,baselineSD:10,retestReliability:1,
    expectedPracticeGain:0,evidence:"independent_retest_study"}),/reliability/);
});
