import {commandSchema,type ParsedAssistantCommand,type SafeAssistantCommand} from "../src/server/assistant-command";
import type {WorkDomain} from "../src/server/work-evidence";
import type {Candidate,Decision,Example,CommandExample} from "./measurement-cases";

const normalize=(value:string)=>value.normalize("NFKC").replace(/\s+/gu,"").replace(/[。.!！]+$/u,"");
export function candidates(value:unknown):Candidate[]{
  if(!Array.isArray(value))return [];
  return value.filter((row):row is Candidate=>Boolean(row)&&typeof row==="object"&&
    typeof row.domain==="string"&&typeof row.actionQuote==="string"&&
    (row.outcomeQuote===null||typeof row.outcomeQuote==="string"));
}
const ratio=(numerator:number,denominator:number)=>denominator?numerator/denominator:null;
export function evidenceMetrics(examples:readonly Example[],outputs:readonly unknown[],available?:readonly boolean[]){
  if(examples.length!==outputs.length)throw new Error("EVALUATION_LENGTH_MISMATCH");
  if(available&&available.length!==outputs.length)throw new Error("EVALUATION_LENGTH_MISMATCH");
  let expectedActions=0,savedActions=0,correctActions=0,expectedResults=0,savedResults=0,correctResults=0;
  const rows=examples.map((example,index)=>{
    const found=candidates(outputs[index]),expected=example.expected;
    const matching=expected?found.find(row=>row.domain===expected.domain&&
      normalize(row.actionQuote)===normalize(expected.actionQuote)):undefined;
    const actionCorrect=Boolean(matching);
    const resultCorrect=Boolean(matching?.outcomeQuote&&expected?.outcomeQuote&&
      normalize(matching.outcomeQuote)===normalize(expected.outcomeQuote));
    const resultCount=found.filter(row=>row.outcomeQuote!==null).length;
    const exact=available?.[index]!==false&&found.length===Number(Boolean(expected))&&actionCorrect===Boolean(expected)&&
      resultCount===Number(Boolean(expected?.outcomeQuote))&&resultCorrect===Boolean(expected?.outcomeQuote);
    expectedActions+=Number(Boolean(expected));savedActions+=found.length;correctActions+=Number(actionCorrect);
    expectedResults+=Number(Boolean(expected?.outcomeQuote));savedResults+=resultCount;correctResults+=Number(resultCorrect);
    return {id:example.id,correct:exact};
  });
  return {cases:examples.length,expectedActions,savedActions,correctActions,
    expectedResults,savedResults,correctResults,falseActions:savedActions-correctActions,
    falseResults:savedResults-correctResults,missedActions:expectedActions-correctActions,
    missedResults:expectedResults-correctResults,actionPrecision:ratio(correctActions,savedActions),
    actionRecall:ratio(correctActions,expectedActions),actionF1:ratio(2*correctActions,savedActions+expectedActions),
    resultPrecision:ratio(correctResults,savedResults),resultRecall:ratio(correctResults,expectedResults),
    exactCaseAccuracy:ratio(rows.filter(row=>row.correct).length,rows.length),rows};
}

// Evaluation-only fixed keyword comparator; it is not a deployed product mode.
const domainRules:readonly [WorkDomain,RegExp][]=[
  ["prediction",/预测|预报/],["learning",/二分法|学到|知识迁移/],
  ["collaboration",/队友|分工|达成一致|协调/],["direction",/决定|取舍|权衡/],
  ["creation",/交付了|提交了|生成了|构建了/],["expression",/写了|解释了|说明了/],
  ["observation",/测量了|采集了|观察了/],["thinking",/比较了|检查了|验证了|测试了|拆分了/]
];
export function ruleWorkEvidence(message:string):Candidate[]{
  const parts=message.split(/[。！？!?；;\r\n]+/u).map(x=>x.trim()).filter(Boolean);
  const result:Candidate[]=[];
  const seen=new Set<WorkDomain>();
  for(let i=0;i<parts.length&&result.length<2;i++){
    const action=parts[i]!;
    if(!action.startsWith("我")||action.length<8)continue;
    const domain=domainRules.find(([,pattern])=>pattern.test(action))?.[0];
    if(!domain||seen.has(domain))continue;
    const following=parts[i+1];
    result.push({domain,actionQuote:action,outcomeQuote:following&&/^(?:结果|实测|发现|收到反馈|对方反馈)/u.test(following)?following:null});
    seen.add(domain);
  }
  return result;
}
export function ruleHabitLevel(note:string):number|null{
  if(/[？?]|明天|如果|同事|书里|希望|还没有开始/.test(note))return null;
  if(/抗拒|强迫/.test(note))return 0;
  if(/反复纠结|好久/.test(note))return 1;
  if(/稍微犹豫|犹豫了一下/.test(note))return 2;
  if(/没经过思考|不用思考|下意识/.test(note))return 4;
  return /自然|刻意提醒/.test(note)?3:null;
}
export function ruleCommand(example:CommandExample):ParsedAssistantCommand{
  const text=example.message;
  const habit=example.habits.find(item=>text.includes(item.title));
  const plan:ParsedAssistantCommand={intent:"chat",habitId:habit?.id??null,title:null,action:null,cue:null,
    status:null,when:text.includes("昨天")?"yesterday":text.includes("今天")?"today":null,
    initiationLevel:null,confidence:0.9,quote:null,reply:"关键词对照规则"};
  if(/添加|创建|建立/.test(text)){
    const routine=text.match(/睡前阅读\d+页/u)?.[0];
    plan.intent="create_habit";plan.title=routine??null;plan.action=routine??null;
  }else if(/进度/.test(text))plan.intent="check_progress";
  else if(/没完成/.test(text)){plan.intent="record_opportunity";plan.status="missed";}
  else if(/没有触发机会/.test(text)){plan.intent="record_opportunity";plan.status="no_cue";}
  else if(/完成了/.test(text)){plan.intent="record_opportunity";plan.status="done";}
  else if(/感觉|自然|思考/.test(text))plan.intent="record_reflection";
  return commandSchema.parse(plan);
}
export function decision(plan:ParsedAssistantCommand|SafeAssistantCommand):Decision{
  if(plan.intent==="create_habit")return {kind:"create"};
  if(!plan.habitId)return {kind:"none"};
  if(plan.intent==="check_progress")return {kind:"progress",habitId:plan.habitId};
  if(plan.intent==="record_reflection")return {kind:"reflection",habitId:plan.habitId,when:plan.when};
  if(plan.intent==="record_opportunity"&&plan.status&&plan.when)
    return {kind:"opportunity",habitId:plan.habitId,status:plan.status,when:plan.when};
  return {kind:"none"};
}
export function exactDecision(expected:Decision,actual:Decision):boolean{
  return JSON.stringify(expected)===JSON.stringify(actual);
}
export function classificationMetrics(rows:readonly {id:string;correct:boolean;falsePositive:boolean;falseNegative:boolean}[]){
  return {cases:rows.length,correct:rows.filter(x=>x.correct).length,
    accuracy:ratio(rows.filter(x=>x.correct).length,rows.length),
    falsePositives:rows.filter(x=>x.falsePositive).length,falseNegatives:rows.filter(x=>x.falseNegative).length,
    discrepancies:rows.filter(x=>!x.correct).map(x=>x.id)};
}
export function pairedCases(before:readonly {id:string;correct:boolean}[],after:readonly {id:string;correct:boolean}[]){
  if(before.length!==after.length||before.some((row,index)=>row.id!==after[index]?.id))throw new Error("EVALUATION_PAIR_MISMATCH");
  let wins=0,ties=0,losses=0;
  for(let i=0;i<before.length;i++){
    const delta=Number(after[i]!.correct)-Number(before[i]!.correct);
    if(delta>0)wins++;else if(delta<0)losses++;else ties++;
  }
  return {wins,ties,losses,accuracyDifferencePoints:before.length?100*(wins-losses)/before.length:null};
}
