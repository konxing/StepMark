import {z} from "zod";

export type OwnedHabit = {id:string;title:string};
export const commandSchema=z.object({
  intent:z.enum(["create_habit","record_opportunity","record_reflection","check_progress","chat","clarify"]),
  habitId:z.string().uuid().nullable(),
  title:z.string().max(180).nullable(),
  action:z.string().max(500).nullable(),
  cue:z.string().max(250).nullable(),
  status:z.enum(["done","missed","no_cue"]).nullable(),
  when:z.enum(["today","yesterday"]).nullable(),
  initiationLevel:z.number().int().min(0).max(4).nullable(),
  confidence:z.number().min(0).max(1),
  quote:z.string().max(180).nullable(),
  reply:z.string().max(500)
}).strict();
export type ParsedAssistantCommand=z.infer<typeof commandSchema>;
export type SafeAssistantCommand=ParsedAssistantCommand&{target:OwnedHabit|null};
const question=/[?？]|(?:是不是|能不能|怎么做|如何|为什么|要不要)/u;
const createWords=/(创建|添加|建立|养成|培养|开始坚持|帮我制定|我想每天|我打算每天|我想每周)/u;
const doneWords=/(做了|完成了|已完成|执行了|打卡了|打卡|读了|阅读了|跑了|练习了|坚持了|已经做|刚做完)/u;
const missedWords=/(没做|没完成|没有完成|未执行|没执行|没打卡|忘记|忘了|没有做)/u;
const noCueWords=/(没机会|没有机会|没有触发|未遇到|没遇到|没出现触发|没有出现)/u;
const reflectionWords=/(感觉|感受|自然|不用思考|没想|纠结|犹豫|抗拒|费力|顺手|轻松|自然而然)/u;

function clarification(message:string):SafeAssistantCommand {
  return {intent:"clarify",habitId:null,title:null,action:null,cue:null,
    status:null,when:null,initiationLevel:null,confidence:0,quote:null,
    reply:message,target:null};
}
/**
 * AI output is only a proposal. It cannot bind another user's habit, infer
 * a completion from a question, or turn weak prose into a numeric self-rating.
 */
export function authorizeAssistantCommand(raw:unknown,userText:string,habits:readonly OwnedHabit[]):SafeAssistantCommand{
  const parsed=commandSchema.safeParse(raw);
  if(!parsed.success)return clarification("我没能可靠理解这条消息，能再说明一次吗？");
  const v=parsed.data;
  const all=habits.filter(x=>x.id===v.habitId);
  let target=all.length===1?all[0]!:null;
  if(v.intent==="chat"||v.intent==="clarify")return {...v,target:null};
  if(v.intent==="create_habit"){
    if(question.test(userText)||!createWords.test(userText)||!v.title?.trim()||
       !v.action?.trim()||v.title.trim().length<2||v.action.trim().length<2||
       v.confidence<0.7)
      return clarification("我可以帮你创建习惯。请明确说出要养成的行为，例如“帮我添加一个睡前阅读10页的习惯”。");
    return {...v,title:v.title.trim(),action:v.action.trim(),cue:v.cue?.trim()||null,target:null};
  }
  if(!target)return clarification("请说清楚是哪一项习惯，比如直接提到它的名字。");
  if(habits.length>1){
    // Prevent a mistaken model-selected UUID from silently modifying a
    // different record when a conversation references several habits.
    const named=habits.filter(h=>userText.includes(h.title));
    if(named.length!==1||named[0]!.id!==target.id)
      return clarification("为了避免把记录写进错误的习惯，请在这句话里直接说出完整习惯名称。");
  }
  if(v.intent==="check_progress")return {...v,target};
  if(question.test(userText))
    return clarification("这句看起来是在提问，我不会把它自动写成已执行记录。需要记录的话，请直接说“我今天完成了某某习惯”。");
  if((userText.includes("昨天")&&v.when!=="yesterday")||
     (v.when==="yesterday"&&!userText.includes("昨天"))||
     (userText.includes("今天")&&v.when==="yesterday"))
    return clarification("日期不够确定。请说明这次是今天还是昨天的记录。");
  if(v.intent==="record_opportunity"){
    if(!v.status||v.confidence<0.75)return clarification("我不确定你是否完成了这次行动，请说清楚“已完成”“有机会未做”或“没有触发机会”。");
    if(v.status==="done"&&(!doneWords.test(userText)||missedWords.test(userText)))
      return clarification("我没有找到明确的“已经执行”证据，请直接告诉我是否完成了。");
    if(v.status==="missed"&&!missedWords.test(userText))
      return clarification("请明确说出这次有机会但没有执行。");
    if(v.status==="no_cue"&&!noCueWords.test(userText))
      return clarification("请明确说出这次没有出现触发机会。");
    return {...v,target};
  }
  if(v.intent==="record_reflection"){
    if(!reflectionWords.test(userText)||v.confidence<0.7)
      return clarification("我可以记录你的感受。请描述开始行动时是自然、犹豫还是需要刻意思考。");
    return {...v,target};
  }
  return clarification("这项操作暂时不支持；我不会修改其他数据。");
}
export function verifiedInitiationEvidence(plan:SafeAssistantCommand,userText:string){
  const q=plan.quote?.trim();
  if(plan.initiationLevel===null||plan.confidence<0.75||!q||
     q.length<3||!userText.includes(q))return null;
  return {level:plan.initiationLevel,quote:q,confidence:plan.confidence};
}
export function validateClientLocalDate(value:string,now=new Date()):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("BAD_LOCAL_DATE");
  const d=new Date(value+"T12:00:00.000Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||
     Math.abs(d.getTime()-now.getTime())>36*60*60*1000)
    throw new Error("BAD_LOCAL_DATE");
  return value;
}
export function observationDay(localDate:string,when:"today"|"yesterday"|null){
  const date=new Date(localDate+"T12:00:00.000Z");
  if(when==="yesterday")date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}
