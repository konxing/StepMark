import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {loadEnvConfig} from "@next/env";
import {resolveAiProvider} from "../src/server/ai-gateway";
import {proposeAssistantCommand} from "../src/server/assistant-provider";
import {inspectHabitNote,type HabitNoteAnnotation} from "../src/server/habit-ai";
import {authorizeAssistantCommand} from "../src/server/assistant-command";
import {groundedWorkEvidence} from "../src/server/work-evidence";
import {safeAiErrorCode} from "../src/server/ai-network";
import {workExamples,habitExamples,commandExamples,type Decision} from "./measurement-cases";
import {challengeCases} from "./measurement-challenge-cases";
import {candidates,evidenceMetrics,ruleWorkEvidence,ruleHabitLevel,ruleCommand,
  decision,exactDecision,classificationMetrics,pairedCases} from "./measurement-metrics";
import {habitComparison} from "./measurement-invariants";

const webDirectory=fileURLToPath(new URL("..",import.meta.url));
const projectDirectory=resolve(webDirectory,"../..");
const reportDirectory=resolve(projectDirectory,"node_modules/.cache/stepmark-measurement");
const caseSets={regression:{workExamples,habitExamples,commandExamples},challenge:challengeCases};
type CaseSetName=keyof typeof caseSets;
type CaseSet=(typeof caseSets)[CaseSetName];
function outputPath(caseSet:CaseSetName){
  return caseSet==="regression"?reportDirectory:resolve(reportDirectory,caseSet);
}
const benchmarkUser="synthetic-measurement-owner";
type RunRow={suite:"work"|"habit"|"command";id:string;repeat:number;elapsedMs:number;ok:boolean;
  raw?:unknown;guarded?:unknown;modelOutput?:unknown;error?:string};
type Report={schemaVersion:"stepmark-ai-comparison-v2";source:"synthetic_regression_cases";
  caseSet:CaseSetName;
  mode:"offline_fixtures"|"live_official_deepseek";status:"running"|"completed"|"completed_with_errors"|"blocked";
  startedAt:string;finishedAt?:string;model:string|null;repeats:number;plannedCalls:number;
  datasetSha256:string;sourceFingerprintSha256:string;casesPerRepeat:{work:number;habit:number;command:number};
  limitations:string[];rows:RunRow[];offline:unknown;comparison?:ReturnType<typeof comparison>};
function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function sourceFingerprint(){
  return hash([
      "apps/web/scripts/evaluate-measurement.ts","apps/web/scripts/measurement-cases.ts",
      "apps/web/scripts/measurement-challenge-cases.ts",
    "apps/web/scripts/measurement-metrics.ts","apps/web/scripts/measurement-invariants.ts",
    "apps/web/src/server/assistant-provider.ts","apps/web/src/server/assistant-command.ts",
    "apps/web/src/server/habit-ai.ts","apps/web/src/server/habit-annotation-grounding.ts",
    "apps/web/src/server/work-evidence.ts",
    "apps/web/src/server/ai-gateway.ts","apps/web/src/server/ai-network.ts",
    "packages/core/src/habit-progress.ts","packages/core/src/measurement-evidence.ts"
  ].map(path=>path+"\n"+hash(readFileSync(resolve(projectDirectory,path),"utf8").replace(/\r\n/g,"\n"))).join("\n"));
}
function storeReport(report:Report){
  const outputDirectory=outputPath(report.caseSet);
  mkdirSync(outputDirectory,{recursive:true});
  const content=JSON.stringify(report,null,2)+"\n";
  const name=report.mode==="offline_fixtures"?"latest-offline.json":"latest-attempt.json";
  const target=resolve(outputDirectory,name);
  writeFileSync(target+".tmp",content);renameSync(target+".tmp",target);
  if(report.mode==="live_official_deepseek"&&report.status.startsWith("completed")){
    writeFileSync(resolve(outputDirectory,"latest-live.json"),content);
    const stamp=report.startedAt.replace(/[:.]/g,"-");
    writeFileSync(resolve(outputDirectory,"live-"+stamp+".json"),content);
    writeFileSync(resolve(outputDirectory,"latest-live.md"),markdownReport(report));
  }
}
const writable=(value:Decision)=>["create","opportunity","reflection"].includes(value.kind);
function commandResult(example:CaseSet["commandExamples"][number],actual:Decision,ok=true){
  return {id:example.id,correct:ok&&exactDecision(example.expected,actual),
    falsePositive:!writable(example.expected)&&writable(actual),
    falseNegative:writable(example.expected)&&!writable(actual)};
}
function ruleBaselines({workExamples,habitExamples,commandExamples}:CaseSet){
  return {
    work:evidenceMetrics(workExamples,workExamples.map(example=>
      groundedWorkEvidence(ruleWorkEvidence(example.message),example.message,benchmarkUser))),
    habit:habitExamples.map(example=>{
      const level=ruleHabitLevel(example.note);
      return {id:example.id,correct:level===example.expected,
        falsePositive:example.expected===null&&level!==null,falseNegative:example.expected!==null&&level===null};
    }),
    command:commandExamples.map(example=>commandResult(example,
      decision(authorizeAssistantCommand(ruleCommand(example),example.message,example.habits))))
  };
}
function comparison(rows:readonly RunRow[],repeats:number,
  {workExamples,habitExamples,commandExamples}:CaseSet,baseline:ReturnType<typeof ruleBaselines>){
  const runs=Array.from({length:repeats},(_,index)=>{
    const round=rows.filter(row=>row.repeat===index+1);
    const work=workExamples.map(example=>round.find(row=>row.suite==="work"&&row.id===example.id));
    const raw=evidenceMetrics(workExamples,work.map(row=>row?.raw),work.map(row=>row?.ok??false));
    const guarded=evidenceMetrics(workExamples,work.map(row=>row?.guarded),work.map(row=>row?.ok??false));
    const habitEvaluations=habitExamples.map(example=>{
      const row=round.find(row=>row.suite==="habit"&&row.id===example.id);
      const proposal=row?.modelOutput as {initiationLevel:number|null}|undefined;
      const annotation=row?.raw as HabitNoteAnnotation|undefined;
      return {example,ok:row?.ok===true,proposedLevel:proposal?.initiationLevel??null,
        validatedLevel:annotation?.level??null};
    });
    const habitRows=(field:"proposedLevel"|"validatedLevel")=>habitEvaluations.map(row=>{
      const level=row[field];
      const {id,expected}=row.example;
      return {id,correct:row.ok&&level===expected,
        falsePositive:expected===null&&level!==null,falseNegative:expected!==null&&level===null};
    });
    const validatedHabitRows=habitRows("validatedLevel");
    const commandRows=(guardedValue:boolean)=>commandExamples.map(example=>{
      const row=round.find(item=>item.suite==="command"&&item.id===example.id);
      const actual=((guardedValue?row?.guarded:row?.raw) as Decision|undefined)??{kind:"none"};
      return commandResult(example,actual,row?.ok===true);
    });
    const rawCommands=commandRows(false),safeCommands=commandRows(true);
    return {repeat:index+1,work:{ruleBaseline:baseline.work,aiRaw:raw,aiGuarded:guarded,paired:pairedCases(baseline.work.rows,guarded.rows)},
      habit:{ruleBaseline:classificationMetrics(baseline.habit),
        aiRaw:classificationMetrics(habitRows("proposedLevel")),ai:classificationMetrics(validatedHabitRows),
        modelAbstentions:habitEvaluations.filter(row=>row.ok&&row.proposedLevel===null).map(row=>row.example.id),
        guardRejections:habitEvaluations.filter(row=>row.ok&&row.proposedLevel!==null&&row.validatedLevel===null)
          .map(row=>row.example.id),
        paired:pairedCases(baseline.habit,validatedHabitRows)},
      command:{ruleBaseline:classificationMetrics(baseline.command),aiRaw:classificationMetrics(rawCommands),
        aiGuarded:classificationMetrics(safeCommands),paired:pairedCases(baseline.command,safeCommands)}};
  });
  const timing=rows.filter(row=>row.ok).map(row=>row.elapsedMs).sort((a,b)=>a-b);
  const quantile=(p:number)=>timing.length?timing[Math.ceil(p*timing.length)-1]!:null;
  return {completedCalls:rows.length,successfulCalls:rows.filter(row=>row.ok).length,
    failedCalls:rows.filter(row=>!row.ok).length,latencyMs:{median:quantile(0.5),p95:quantile(0.95)},runs,
    stability:[...workExamples.map(row=>({suite:"work",id:row.id})),...habitExamples.map(row=>({suite:"habit",id:row.id})),
      ...commandExamples.map(row=>({suite:"command",id:row.id}))].map(item=>{
      const observed=rows.filter(row=>row.suite===item.suite&&row.id===item.id&&row.ok);
      return {...item,successfulRepeats:observed.length,distinctOutputs:new Set(observed.map(row=>
        JSON.stringify(item.suite==="habit"?(row.raw as {level?:unknown})?.level:row.guarded))).size};
    })};
}
const percent=(value:number|null)=>value===null?"—":(100*value).toFixed(1)+"%";
function markdownReport(report:Report){
  const table=(report.comparison?.runs??[]).flatMap(run=>[
    `| ${run.repeat} | 成长证据整条正确率 | ${percent(run.work.ruleBaseline.exactCaseAccuracy)} | ${percent(run.work.aiGuarded.exactCaseAccuracy)} |`,
    `| ${run.repeat} | 成长行动提取 F1 | ${percent(run.work.ruleBaseline.actionF1)} | ${percent(run.work.aiGuarded.actionF1)} |`,
    `| ${run.repeat} | 习惯自然启动识别 | ${percent(run.habit.ruleBaseline.accuracy)} | ${percent(run.habit.ai.accuracy)} |`,
    `| ${run.repeat} | 习惯操作识别 | ${percent(run.command.ruleBaseline.accuracy)} | ${percent(run.command.aiGuarded.accuracy)} |`
  ]).join("\n");
  return `# StepMark 真实 DeepSeek 对照测试\n\n用例集：${report.caseSet}；状态：${report.status}；模型：${report.model}；成功调用：${report.comparison?.successfulCalls}/${report.plannedCalls}。\n\n`+
    `数据指纹：\`${report.datasetSha256}\`。代码指纹：\`${report.sourceFingerprintSha256}\`。\n\n`+
    `| 轮次 | 指标 | 固定关键词规则（评测对照） | DeepSeek 与产品校验 |\n|---|---|---:|---:|\n${table}\n\n`+
    "关键词规则是评测用比较器，不是产品已有的无 AI 模式。产品手动填写流程的用户准确率和操作耗时未在本次测量。\n\n"+
    "测试只包含仓库合成回归样例，不包含真实参与者或独立抽样数据。结果可以比较这些功能用例的识别表现，不能证明人的能力或习惯真正提升，也不能校准 0–100 评分。逐条模型结果、错误和重复稳定性见同目录 JSON。\n";
}

async function main(){
  const args=process.argv.slice(2);
  let live=false,repeats=1;
  let selectedCaseSet:CaseSetName|undefined;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--live"&&!live)live=true;
    else if(args[i]==="--repeats"&&/^[1-3]$/.test(args[i+1]??""))repeats=Number(args[++i]);
    else if(args[i]==="--suite"&&!selectedCaseSet&&(args[i+1]==="regression"||args[i+1]==="challenge"))
      selectedCaseSet=args[++i] as CaseSetName;
    else throw new Error("INVALID_EVALUATION_ARGS");
  }
  if(!live&&repeats!==1)throw new Error("REPEATS_REQUIRE_LIVE_EVALUATION");
  if(live)loadEnvConfig(webDirectory,false,{info(){},error(){}});
  process.env.AI_ASSISTANT_DIGEST_SECRET="stepmark-synthetic-measurement-benchmark-key";
  const caseSet=selectedCaseSet??"regression";
  const examples=caseSets[caseSet];
  const {workExamples,habitExamples,commandExamples}=examples;
  const baseline=ruleBaselines(examples);
  const outputDirectory=outputPath(caseSet);
  const fixture=evidenceMetrics(workExamples,workExamples.map(example=>
    groundedWorkEvidence(example.fixture,example.message,benchmarkUser)));
  assert.equal(fixture.falseActions,0);assert.equal(fixture.falseResults,0);
  assert.equal(fixture.correctActions,fixture.expectedActions);assert.equal(fixture.correctResults,fixture.expectedResults);
  const report:Report={schemaVersion:"stepmark-ai-comparison-v2",source:"synthetic_regression_cases",caseSet,
    mode:live?"live_official_deepseek":"offline_fixtures",status:"running",startedAt:new Date().toISOString(),
    model:null,repeats,plannedCalls:live?repeats*(workExamples.length+habitExamples.length+commandExamples.length):0,
    datasetSha256:hash(JSON.stringify({workExamples,habitExamples,commandExamples})),sourceFingerprintSha256:sourceFingerprint(),
    casesPerRepeat:{work:workExamples.length,habit:habitExamples.length,command:commandExamples.length},
    limitations:["Synthetic regression cases; no participant data or population accuracy claim.",
      "Rule baseline is an evaluation-only comparator, not deployed non-AI user behavior.",
      "AI annotations cannot directly increase habit progress or ability scores.",
      "Public longitudinal research data have no paired AI/no-AI labels and are not uploaded."],
    rows:[],offline:{fixture,ruleWorkBaseline:baseline.work,ruleHabitBaseline:classificationMetrics(baseline.habit),
      ruleCommandBaseline:classificationMetrics(baseline.command),habitProgress:habitComparison()}};
  if(!live){report.status="completed";report.finishedAt=new Date().toISOString();storeReport(report);console.log(JSON.stringify(report,null,2));return;}
  for(const purpose of ["assistant","habit"] as const){
    const config=resolveAiProvider(purpose);
    if(config.url!=="https://api.deepseek.com/chat/completions"||config.model!=="deepseek-flash")
      throw new Error("LIVE_EVALUATION_REQUIRES_OFFICIAL_DEEPSEEK_FLASH");
  }
  report.model="deepseek-flash";storeReport(report);
  const tasks=[...workExamples.map(example=>({suite:"work" as const,id:example.id,run:async()=>{
    const output=await proposeAssistantCommand(example.message,[],true);
    return {raw:candidates(output.growthEvidence),guarded:groundedWorkEvidence(output.growthEvidence,example.message,benchmarkUser),
      modelOutput:{plan:output.plan,growthEvidence:output.growthEvidence}};
  }})),...habitExamples.map(example=>({suite:"habit" as const,id:example.id,run:async()=>{
    const {proposal,annotation}=await inspectHabitNote(example.note);
    return {raw:annotation,modelOutput:proposal};
  }})),
    ...commandExamples.map(example=>({suite:"command" as const,id:example.id,run:async()=>{
      const output=await proposeAssistantCommand(example.message,example.habits,false);
      return {raw:decision(output.plan),guarded:decision(authorizeAssistantCommand(output.plan,example.message,example.habits)),modelOutput:output.plan};
    }}))];
  console.log(`即将真实调用 DeepSeek ${report.plannedCalls} 次，仅发送 ${tasks.length} 条合成用例，不访问业务数据库。`);
  let failedInARow=0;
  for(let repeat=1;repeat<=repeats;repeat++)for(const task of tasks){
    const start=performance.now();
    try{
      const value=await task.run();
      report.rows.push({suite:task.suite,id:task.id,repeat,elapsedMs:Math.round(performance.now()-start),ok:true,...value});
      failedInARow=0;
    }catch(error){
      const code=safeAiErrorCode(error)??(error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"EVALUATION_FAILED");
      report.rows.push({suite:task.suite,id:task.id,repeat,elapsedMs:Math.round(performance.now()-start),ok:false,error:code});
      failedInARow++;
      const fatal=["AI_NETWORK_BLOCKED","AI_DNS_FAILED","AI_CONNECTION_REFUSED","AI_AUTHENTICATION_FAILED",
        "AI_INSUFFICIENT_BALANCE","AI_MODEL_UNAVAILABLE","AI_PROXY_INVALID","AI_PROXY_RUNTIME_UNSUPPORTED"].includes(code);
      if(fatal||failedInARow>=3){
        report.status="blocked";report.finishedAt=new Date().toISOString();storeReport(report);
        console.error("真实评测未完成："+code+"。结果已保存至 "+outputDirectory);
        process.exitCode=1;return;
      }
    }
    storeReport(report);
    console.log(`[${report.rows.length}/${report.plannedCalls}] ${task.suite}/${task.id}：${report.rows.at(-1)!.ok?"收到回复":report.rows.at(-1)!.error}`);
  }
  report.status=report.rows.some(row=>!row.ok)?"completed_with_errors":"completed";
  report.finishedAt=new Date().toISOString();report.comparison=comparison(report.rows,repeats,examples,baseline);storeReport(report);
  console.log(markdownReport(report));
  console.log("完整结果已保存："+resolve(outputDirectory,"latest-live.json"));
  if(report.status!=="completed")process.exitCode=1;
}
void main().catch(error=>{
  const code=safeAiErrorCode(error)??(error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"EVALUATION_FAILED");
  console.error("Measurement evaluation incomplete: "+code);process.exitCode=1;
});
