import {z} from "zod";
import {assistantMessageDigest} from "./assistant-command";

export const workDomains={
  thinking:"发现问题与系统推理",
  expression:"语言表达",
  observation:"观察与证据判断",
  prediction:"预测与验证",
  learning:"学习与知识迁移",
  creation:"工具协作与成果交付",
  collaboration:"沟通与协作",
  direction:"方向与价值判断"
} as const;
export type WorkDomain=keyof typeof workDomains;
export const WORK_EVIDENCE_RUBRIC="reported-action-v2";
export const workEvidenceSelect={id:true,domain:true,stage:true,actionQuote:true,
  outcomeQuote:true,reportDay:true,modelId:true,rubric:true,createdAt:true} as const;
const candidateSchema=z.object({domain:z.enum(Object.keys(workDomains) as WorkDomain[]),
  actionQuote:z.string().trim().min(8).max(180),outcomeQuote:z.string().trim().min(6).max(180).nullable()}).strict();
const excludedMessage=/(?:不要|别|不用|无需|不许|不想|不希望)(?:(?:把|给|为).{0,15})?(?:记录|存档|保存|量化|评分|打分)|(?:do not|don't|never)\s+(?:save|record|store|score|log)|(?:举个例子|只是假设|只是示例|这是测试|假装|模拟数据|pretend|hypothetical)/iu;
const temporalOrOther=/(?:如果|假如|例如|比如|打算|准备(?:去|做|写|学)|希望|计划(?:去|要|做|写)|明天|下周|将来|尚未|还没|未能|没有(?:做|测试|验证|结果)|不是我)|(?:我的(?:同事|朋友|家人)|朋友他|别人|他们|她们|他已经|她已经)|(?:\b(?:will|would|plan to|going to|my (?:friend|coworker)|did not|didn't)\b)/iu;
const hypotheticalSetup=/(?:^|[，,：:])\s*(?:(?:请|我(?:们)?|你)\s*)?先?假设|(?:^|[,:])\s*(?:suppose|assume)\b/iu;
const happened=/(?:我[^。！？!?\n]{0,35}(?:完成了|做了|做完了|用了|试了|测试了|写了|写出了|看了|找到了|整理了|拆分了|检查了|验证了|比较了|测量了|决定了|解决了|给出了|记录了|提交了|交付了|复盘了|讨论了|确认了))|\bI\s+(?:(?:have|already)\s+)?(?:completed|built|wrote|used|compared|tested|checked|measured|reported|presented|decided|shipped|found|revised)\b/iu;
const delegatedAction=/(?:我[^，,]{0,12}(?:让|请|叫|委托)\s*(?:ai\b|chatgpt\b|deepseek\b|claude\b|助手|模型|别人|同事|朋友|他|她)|(?:ai\b|chatgpt\b|deepseek\b|claude\b|助手|模型)\s*(?:替我|帮我|给我)|\bi\s+(?:asked|had|told)\s+(?:ai|chatgpt|deepseek|claude|someone|my coworker)\b)/iu;
const observedResult=/^(?:(?:这次)?(?:结果|实测|测得|发现|对比发现|复查发现|复测发现|收到反馈|对方反馈)|(?:the\s+)?(?:result\b|test (?:showed|confirmed)\b)|I\s+(?:found|observed|measured)\b)/iu;
const speculativeResult=/(?:预计|预期|预估|估计会|可能会|有望|将会|未验证|还待验证|尚待验证)|\b(?:likely|expect(?:ed)?|forecast|estimated|might|could)\b/iu;
const sensitive=/(?:\bsk-[a-z\d_-]{12,}|\b(?:api[_ -]?key|password|access[_ -]?token)\s*[:=]|(?:密码|密钥|验证码)\s*[:：=]|\b\d{17}[\dX]\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;

const sentenceBoundary=/[。！？!?；;\r\n]+|\.(?=\s|$)/u;
const resultGap=/^[\s，,。；;：:.]*$/u;
const quotationPairs=new Map([["“","”"],["「","」"],["『","』"],['"','"']]);

function insideQuotation(message:string,offset:number){
  const endings:string[]=[];
  for(const character of message.slice(0,offset)){
    if(character===endings.at(-1)){
      endings.pop();
      continue;
    }
    const ending=quotationPairs.get(character);
    if(ending)endings.push(ending);
  }
  return endings.length>0;
}

function sourceSpan(message:string,quote:string){
  const start=message.indexOf(quote);
  if(start<0||message.indexOf(quote,start+1)>=0||/[？?]/u.test(quote)||
    quote.split(sentenceBoundary).filter(part=>part.trim()).length!==1)return null;
  const end=start+quote.length;
  const before=message.slice(0,start).split(sentenceBoundary).at(-1)??"";
  const after=message.slice(end).split(sentenceBoundary)[0]??"";
  if(insideQuotation(message,start)||/^[？?]/u.test(message.slice(end+after.length)))return null;
  return {start,end,clause:before+quote+after};
}

export function groundedWorkEvidence(raw:unknown,message:string,userId:string){
  if(!Array.isArray(raw)||raw.length>2||excludedMessage.test(message)||sensitive.test(message))return [];
  const seenDomains=new Set<WorkDomain>();
  const seenActions=new Set<string>();
  return raw.flatMap(value=>{
    const candidate=candidateSchema.safeParse(value);
    if(!candidate.success)return [];
    const {domain,actionQuote}=candidate.data;
    const action=sourceSpan(message,actionQuote);
    const performed=happened.exec(actionQuote);
    if(seenDomains.has(domain)||!action||!performed||insideQuotation(message,action.start+performed.index)||
      temporalOrOther.test(action.clause)||hypotheticalSetup.test(action.clause)||
      delegatedAction.test(action.clause))return [];
    const actionKey=actionQuote.normalize("NFKC").toLowerCase().replace(/\s+/gu,"");
    if(seenActions.has(actionKey))return [];
    const quote=candidate.data.outcomeQuote;
    const result=quote?sourceSpan(message,quote):null;
    const outcomeQuote=quote&&result&&result.start>=action.end&&
      resultGap.test(message.slice(action.end,result.start))&&observedResult.test(quote)&&
      !temporalOrOther.test(result.clause)&&!hypotheticalSetup.test(result.clause)&&
      !speculativeResult.test(result.clause)?quote:null;
    seenDomains.add(domain);
    seenActions.add(actionKey);
    return [{domain,actionQuote,outcomeQuote,stage:outcomeQuote?2:1,
      digest:assistantMessageDigest(JSON.stringify([userId,actionKey]))}];
  });
}
