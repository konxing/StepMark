import {z} from "zod";
import {assistantMessageDigest} from "./assistant-command";

export const workDomains={
  thinking:"问题拆解与推理",
  expression:"语言表达",
  observation:"观察与证据判断",
  prediction:"预测与验证",
  learning:"学习与迁移",
  creation:"工具使用与创造交付",
  collaboration:"沟通与协作",
  direction:"自主选择方向"
} as const;
export type WorkDomain=keyof typeof workDomains;
export const WORK_EVIDENCE_RUBRIC="reported-action-v1";
export const workEvidenceSelect={id:true,domain:true,stage:true,actionQuote:true,
  outcomeQuote:true,reportDay:true,modelId:true,rubric:true,createdAt:true} as const;
const candidateSchema=z.object({domain:z.enum(Object.keys(workDomains) as WorkDomain[]),
  actionQuote:z.string().trim().min(8).max(180),outcomeQuote:z.string().trim().min(6).max(180).nullable()}).strict();
const excludedMessage=/(?:不要|别|不用|无需|不许|不想|不希望)(?:(?:把|给|为).{0,15})?(?:记录|存档|保存|量化|评分|打分)|(?:do not|don't|never)\s+(?:save|record|store|score|log)|(?:举个例子|只是假设|只是示例|这是测试|假装|模拟数据|pretend|hypothetical)/iu;
const temporalOrOther=/(?:如果|假如|假设|例如|比如|打算|准备(?:去|做|写|学)|希望|计划(?:去|要|做|写)|明天|下周|将来|尚未|还没|未能|没有(?:做|测试|验证|结果)|不是我)|(?:我的(?:同事|朋友|家人)|朋友他|别人|他们|她们|他已经|她已经)|(?:\b(?:will|would|plan to|going to|my (?:friend|coworker)|did not|didn't)\b)/iu;
const happened=/(?:我[^。！？!?\n]{0,35}(?:完成了|做了|做完了|用了|试了|测试了|写了|写出了|看了|找到了|整理了|拆分了|检查了|验证了|比较了|测量了|决定了|解决了|给出了|记录了|提交了|交付了|复盘了|讨论了|确认了))|\bI\s+(?:(?:have|already)\s+)?(?:completed|built|wrote|used|compared|tested|checked|measured|reported|presented|decided|shipped|found|revised)\b/iu;
const observedResult=/(?:结果|发现|实测|测得|显示|反馈|通过|失败|减少|增加|改善|复现|跑通|验证|识别|正确|不一致|一致)|\b(?:result|found|showed|measured|passed|failed|feedback|observed|decreased|increased|confirmed)\b/iu;
const sensitive=/(?:\bsk-[a-z\d_-]{12,}|\b(?:api[_ -]?key|password|access[_ -]?token)\s*[:=]|(?:密码|密钥|验证码)\s*[:：=]|\b\d{17}[\dX]\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;

function sourceClause(message:string,quote:string){
  return message.split(/[。！？!?\r\n]+|\.(?=\s|$)/u).find(clause=>{
    const position=clause.indexOf(quote);
    return position>=0&&!/[“「『"]/u.test(clause.slice(0,position));
  });
}

export function groundedWorkEvidence(raw:unknown,message:string,userId:string){
  if(!Array.isArray(raw)||raw.length>2||excludedMessage.test(message)||sensitive.test(message))return [];
  const seen=new Set<WorkDomain>();
  return raw.flatMap(value=>{
    const candidate=candidateSchema.safeParse(value);
    if(!candidate.success)return [];
    const {domain,actionQuote}=candidate.data;
    const clause=sourceClause(message,actionQuote);
    if(seen.has(domain)||!clause||!happened.test(actionQuote)||temporalOrOther.test(clause))return [];
    const quote=candidate.data.outcomeQuote;
    const resultClause=quote?sourceClause(message,quote):undefined;
    const outcomeQuote=quote&&resultClause&&observedResult.test(quote)&&!temporalOrOther.test(resultClause)&&
      !quote.includes(actionQuote)&&!actionQuote.includes(quote)?quote:null;
    seen.add(domain);
    return [{domain,actionQuote,outcomeQuote,stage:outcomeQuote?2:1,
      digest:assistantMessageDigest(JSON.stringify([userId,actionQuote.normalize("NFKC").toLowerCase().replace(/\s+/gu,"")]))}];
  });
}
