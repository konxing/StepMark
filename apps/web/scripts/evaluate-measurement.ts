import assert from "node:assert/strict";
import {config as loadEnvironment} from "dotenv";
import {calculateHabitProgress,describePublicReasoningEvidence,type InitiationEvidence,type ObservedForm} from "@stepmark/core";
import {assistantProviderConfig,proposeAssistantCommand} from "../src/server/assistant-provider";
import {groundedWorkEvidence,type WorkDomain} from "../src/server/work-evidence";

type Candidate={domain:WorkDomain;actionQuote:string;outcomeQuote:string|null};
type Example={id:string;message:string;expected:Candidate|null;fixture:Candidate[]};
const reasoning:Candidate={domain:"thinking",actionQuote:"我比较了两套故障解释",outcomeQuote:"结果发现刷新缓存后仍可复现"};
const say=(candidate:Candidate)=>[candidate.actionQuote,candidate.outcomeQuote].filter(Boolean).join("。")+"。";
const positive=(id:string,domain:WorkDomain,actionQuote:string,outcomeQuote:string|null):Example=>{
  const expected={domain,actionQuote,outcomeQuote};
  return {id,message:say(expected),expected,fixture:[expected]};
};
const rejection=(id:string,message:string,fixture:Candidate=reasoning):Example=>({
  id,message,expected:null,fixture:[fixture]
});
const planned="结果预计会减少两次返工";
const examples:Example[]=[
  positive("diagnosis","thinking",reasoning.actionQuote,reasoning.outcomeQuote),
  positive("expression","expression","我写了一份给新同事看的排查说明","对方反馈用说明定位到了问题"),
  positive("fact-check","observation","我测量了十二次接口延迟","实测中位数是四十毫秒"),
  positive("check-forecast","prediction","我验证了昨天的延迟预测","结果偏差只有三毫秒"),
  positive("transfer","learning","我用了二分法排查另一段日志","结果三轮就定位到问题"),
  positive("delivery","creation","我交付了修订后的数据核对表",null),
  positive("coordination","collaboration","我讨论了两个处理方案并和队友达成一致","收到反馈确认本轮分工可行"),
  positive("direction","direction","我决定了先做恢复验证来降低发布风险",null),
  positive("ai-reviewed","thinking","我检查了AI方案里的三条假设","结果发现第三条假设不符合实测数据"),
  {id:"two-actions",message:`${reasoning.actionQuote}。我检查了另一个项目的脚本。${reasoning.outcomeQuote}。`,
    expected:{...reasoning,outcomeQuote:null},fixture:[reasoning]},
  {id:"projected-outcome",message:`${reasoning.actionQuote}。${planned}。`,
    expected:{...reasoning,outcomeQuote:null},fixture:[{...reasoning,outcomeQuote:planned}]},
  {id:"suggested-twice",message:say(reasoning),expected:reasoning,
    fixture:[reasoning,{...reasoning,domain:"observation"}]},
  rejection("conditional","假设"+say(reasoning)),
  rejection("question",reasoning.actionQuote+"？"),
  rejection("borrowed-quote",`转述同事的原文：“运行情况如下。${say(reasoning)}”`),
  rejection("privacy-opt-out","这条别记录。"+say(reasoning)),
  rejection("future","明天"+say(reasoning)),
  rejection("assistant-delegation","我请AI写了完整的系统设计文档",{
    domain:"creation",actionQuote:"我请AI写了完整的系统设计文档",outcomeQuote:null
  }),
  rejection("invented-quote","我想了解怎么排查间歇性故障。"),
  rejection("demo","举个例子。"+say(reasoning))
];

const normalize=(value:string)=>value.normalize("NFKC").replace(/\s+/gu,"").replace(/[。.!！]+$/u,"");
function proposals(value:unknown){
  if(!Array.isArray(value))return [];
  return value.filter((row):row is Candidate=>Boolean(row)&&typeof row==="object"&&
    typeof row.domain==="string"&&typeof row.actionQuote==="string"&&
    (row.outcomeQuote===null||typeof row.outcomeQuote==="string"));
}
function evaluate(outputs:unknown[]){
  const metrics={cases:examples.length,expectedActions:0,savedActions:0,correctActions:0,incorrectDomains:0,
    expectedResults:0,savedResults:0,correctResults:0};
  const discrepancies:string[]=[];
  for(let index=0;index<examples.length;index++){
    const example=examples[index]!;
    const expected=example.expected;
    const found=proposals(outputs[index]);
    const matchingAction=expected?found.find(row=>normalize(row.actionQuote)===normalize(expected.actionQuote)):undefined;
    const correctAction=Boolean(matchingAction&&expected&&matchingAction.domain===expected.domain);
    const correctResult=Boolean(correctAction&&matchingAction?.outcomeQuote&&expected?.outcomeQuote&&
      normalize(matchingAction.outcomeQuote)===normalize(expected.outcomeQuote));
    metrics.expectedActions+=Number(Boolean(expected));
    metrics.savedActions+=found.length;
    metrics.correctActions+=Number(correctAction);
    metrics.incorrectDomains+=Number(Boolean(matchingAction)&&!correctAction);
    metrics.expectedResults+=Number(Boolean(expected?.outcomeQuote));
    metrics.savedResults+=found.filter(row=>row.outcomeQuote!==null).length;
    metrics.correctResults+=Number(correctResult);
    if(found.length!==(expected?1:0)||Boolean(expected)!==correctAction||
      Boolean(expected?.outcomeQuote)!==correctResult||found.filter(row=>row.outcomeQuote!==null).length!==(expected?.outcomeQuote?1:0)){
      discrepancies.push(example.id);
    }
  }
  return {...metrics,falseActions:metrics.savedActions-metrics.correctActions,
    falseResults:metrics.savedResults-metrics.correctResults,discrepancies};
}

function habitComparison(){
  const day=86400000,nowMs=1800000000000;
  const input={completedRepetitions:90,completedOpportunities:90,eligibleOpportunities:100,
    nowMs,recentOpportunities:{completed:12,eligible:12}};
  const selfRatings:InitiationEvidence[]=[1,13,25].map(days=>({
    atMs:nowMs-days*day,level:4,confidence:1,source:"self_report"
  }));
  const aiRatings=selfRatings.map(rating=>({...rating,source:"ai_interpretation" as const}));
  const control=calculateHabitProgress({...input,observations:[]});
  const aiOnly=calculateHabitProgress({...input,observations:aiRatings});
  const self=calculateHabitProgress({...input,observations:selfRatings});
  const both=calculateHabitProgress({...input,observations:[...selfRatings,...aiRatings]});
  const manyMisses=calculateHabitProgress({...input,observations:selfRatings,recentOpportunities:{completed:4,eligible:12}});
  const noNewRecords=calculateHabitProgress({...input,observations:selfRatings,nowMs:nowMs+60*day});
  const twenty=calculateHabitProgress({
    completedRepetitions:20,completedOpportunities:20,eligibleOpportunities:20,nowMs,
    observations:[{atMs:nowMs-day,level:2,source:"self_report",confidence:1}]
  });
  assert.equal(aiOnly.progress,control.progress);
  assert.equal(both.progress,self.progress);
  assert.equal(noNewRecords.progress,self.progress);
  assert.ok(manyMisses.progress<80&&self.progress>=80);
  const forms:ObservedForm[]=["logic-a-v1","logic-b-v1"].map((code,index)=>({
    code,status:"completed",total:6,attempted:6,correct:index===0?3:5,
    completedAt:new Date(nowMs+(index*7-10)*day).toISOString(),integrityStatus:"verified"
  }));
  const measurement=describePublicReasoningEvidence(forms);
  assert.equal(measurement.rawComparison?.rawDifferencePoints,33);
  assert.equal(measurement.ability.theta,null);
  return {twentyMildHesitation:twenty.progress,ninetyNoRatings:control.progress,ninetyAiOnly:aiOnly.progress,
    ninetyRepeatedNatural:self.progress,ninetyNaturalWithAi:both.progress,observedFourOfTwelve:manyMisses.progress,
    noNewRecordsForSixtyDays:noNewRecords.progress,independentTaskDifferencePoints:measurement.rawComparison.rawDifferencePoints};
}

async function main(){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=="--live")||args.length>1)throw new Error("INVALID_EVALUATION_ARGS");
  const live=args.includes("--live");
  if(live)loadEnvironment({path:[".env.local",".env"],quiet:true});
  // The benchmark's digest is private to these synthetic samples.
  process.env.AI_ASSISTANT_DIGEST_SECRET="stepmark-synthetic-measurement-benchmark-key";
  const applyGuard=(rows:unknown[])=>examples.map((example,index)=>
    groundedWorkEvidence(rows[index],example.message,"synthetic-measurement-owner"));
  const fixtures=examples.map(example=>example.fixture);
  const fixtureReport=evaluate(applyGuard(fixtures));
  console.log(JSON.stringify({
    source:"synthetic examples; raw proposals in this section are hand-built fixtures",
    noAiChatExtraction:evaluate(examples.map(()=>[])),ungroundedFixtures:evaluate(fixtures),
    guardedFixtures:fixtureReport,habitProgress:habitComparison()
  },null,2));
  assert.equal(fixtureReport.falseActions,0);
  assert.equal(fixtureReport.falseResults,0);
  assert.equal(fixtureReport.correctActions,fixtureReport.expectedActions);
  assert.equal(fixtureReport.correctResults,fixtureReport.expectedResults);
  if(!live)return;
  const provider=assistantProviderConfig();
  if(provider.url!=="https://api.deepseek.com/chat/completions"||provider.model!=="deepseek-flash"){
    throw new Error("LIVE_EVALUATION_REQUIRES_OFFICIAL_DEEPSEEK_FLASH");
  }
  const liveOutputs:unknown[]=[];
  const started=performance.now();
  for(const example of examples){
    const result=await proposeAssistantCommand(example.message,[],true);
    liveOutputs.push(result.growthEvidence);
  }
  console.log(JSON.stringify({source:"live DeepSeek Flash; only synthetic examples sent",
    model:provider.model,elapsedMs:Math.round(performance.now()-started),
    raw:evaluate(liveOutputs),guarded:evaluate(applyGuard(liveOutputs))},null,2));
}

void main().catch(error=>{
  const code=typeof error?.cause?.code==="string"&&/^[A-Z0-9_]+$/.test(error.cause.code)?error.cause.code:undefined;
  const diagnostic=code??(error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"EVALUATION_FAILED");
  console.error("Measurement evaluation incomplete: "+diagnostic);
  process.exitCode=1;
});
