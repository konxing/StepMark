import {createHash} from "node:crypto";
import {Prisma} from "@/generated/prisma/client";
import {calculateHabitProgress,type InitiationEvidence} from "@stepmark/core";
import {getDb} from "./db";
import {ApiError} from "./security";
import {observationDay,type SafeAssistantCommand,validateClientLocalDate,verifiedInitiationEvidence} from "./assistant-command";

export type AssistantResult={
  reply:string;
  change:null|{kind:"habit_created"|"opportunity_recorded"|"reflection_recorded";habitId:string;habitTitle:string};
  progress:null|{habitId:string;percent:number;repetitions:number;evidenceStale:boolean};
};
const limitText=(value:string,length=500)=>value.slice(0,length);

export async function executeAssistantCommand(args:{
  userId:string;requestId:string;message:string;localDate:string;
  command:SafeAssistantCommand;model:string
}):Promise<AssistantResult>{
  const {userId,requestId,message,command,model}=args;
  const localDate=validateClientLocalDate(args.localDate);
  const digest=createHash("sha256").update(message).digest("hex");
  const db=getDb();
  const key={userId_requestId:{userId,requestId}};
  const old=await db.assistantAction.findUnique({where:key,select:{messageDigest:true,result:true}});
  if(old){
    if(old.messageDigest!==digest)throw new ApiError(409,"ASSISTANT_REQUEST_ID_REUSED");
    return old.result as AssistantResult;
  }
  // Transactional one-use action receipt protects writes against same-key
  // concurrent retries and lets the user see what was changed.
  try{
    return await db.$transaction(async tx=>{
      const previous=await tx.assistantAction.findUnique({where:key,select:{messageDigest:true,result:true}});
      if(previous){
        if(previous.messageDigest!==digest)throw new ApiError(409,"ASSISTANT_REQUEST_ID_REUSED");
        return previous.result as AssistantResult;
      }
      let result:AssistantResult={reply:limitText(command.reply||"我理解了。"),
        change:null,progress:null};
      if(command.intent==="create_habit"){
        const count=await tx.habit.count({where:{userId,archivedAt:null}});
        if(count>=50)throw new ApiError(409,"HABIT_QUOTA_EXCEEDED");
        const existing=await tx.habit.findFirst({
          where:{userId,archivedAt:null,title:command.title!,action:command.action!,
            createdAt:{gte:new Date(Date.now()-10*60*1000)}},select:{id:true,title:true}
        });
        const created=existing??await tx.habit.create({
          data:{userId,title:command.title!,action:command.action!,cue:command.cue},
          select:{id:true,title:true}
        });
        result={reply:existing?"相同的习惯近期已经建立，没有重复创建。":
          `已为你建立「${created.title}」。以后直接和我说执行情况，我会记录到你的账户中。`,
          change:{kind:"habit_created",habitId:created.id,habitTitle:created.title},progress:null};
      }else if(command.intent==="record_opportunity" && command.target){
        const target=await tx.habit.findFirst({where:{id:command.target.id,userId,archivedAt:null},
          select:{id:true,title:true}});
        if(!target)throw new ApiError(404,"HABIT_NOT_FOUND");
        const day=observationDay(localDate,command.when);
        const eligible=command.status!=="no_cue",completed=command.status==="done";
        const key2={habitId_opportunityKey:{habitId:target.id,opportunityKey:"daily:"+day}};
        const existing=await tx.habitEvent.findUnique({where:key2});
        if(existing && (existing.completed!==completed||existing.eligible!==eligible)){
          result={reply:`${day} 的「${target.title}」已有不同状态。为了避免覆盖记录，请在习惯详情中使用“更正”并查看审计历史。`,
            change:null,progress:null};
        }else{
          if(!existing){
            await tx.habitEvent.create({data:{
              habitId:target.id,opportunityKey:"daily:"+day,
              eligible,completed,occurredAt:day===localDate?new Date():new Date(day+"T12:00:00.000Z"),
              source:"assistant"
            }});
          }
          const evidence=completed?verifiedInitiationEvidence(command,message):null;
          let recordedFeeling=false;
          if(evidence&&(!existing || !(await tx.habitReflection.findUnique({
            where:{eventId:existing.id},select:{id:true}})))){
            const eventId=existing?.id||(await tx.habitEvent.findUniqueOrThrow({where:key2,select:{id:true}})).id;
            await tx.habitReflection.create({data:{habitId:target.id,eventId,
              note:message.slice(0,600),initiationLevel:null,aiConsent:true,
              aiStatus:"COMPLETED",aiLevel:evidence.level,aiConfidence:evidence.confidence,
              aiQuote:evidence.quote,aiModelId:model.slice(0,100),
              aiPromptVersion:"conversation-intent-v1",reviewedAt:new Date()}});
            recordedFeeling=true;
          }
          const state=completed?"已执行":eligible?"有机会但未执行":"没有出现触发情境";
          result={reply:`已记录「${target.title}」在 ${day} 的状态：${state}。这是行为记录，不会直接改变能力分数。`,
            change:existing?null:{kind:"opportunity_recorded",habitId:target.id,habitTitle:target.title},
            progress:null};
        }
      }else if(command.intent==="record_reflection" && command.target){
        const target=await tx.habit.findFirst({where:{id:command.target.id,userId,archivedAt:null},
          select:{id:true,title:true}});
        if(!target)throw new ApiError(404,"HABIT_NOT_FOUND");
        const start=new Date();start.setUTCHours(0,0,0,0);
        const count=await tx.habitReflection.count({where:{habitId:target.id,createdAt:{gte:start}}});
        if(count>=2)throw new ApiError(429,"REFLECTION_DAILY_LIMIT");
        const day=observationDay(localDate,command.when);
        const event=await tx.habitEvent.findUnique({where:{
          habitId_opportunityKey:{habitId:target.id,opportunityKey:"daily:"+day}
        },select:{id:true,completed:true}});
        const freeEvent=event?.completed ? await tx.habitReflection.findUnique({
          where:{eventId:event.id},select:{id:true}}):null;
        const evidence=verifiedInitiationEvidence(command,message);
        await tx.habitReflection.create({data:{
          habitId:target.id,eventId:event?.completed&&!freeEvent?event.id:null,
          note:message.slice(0,600),initiationLevel:null,aiConsent:true,
          aiStatus:"COMPLETED",aiLevel:evidence?.level??null,
          aiConfidence:evidence?.confidence??null,aiQuote:evidence?.quote??null,
          aiModelId:model.slice(0,100),aiPromptVersion:"conversation-intent-v1",
          reviewedAt:new Date()
        }});
        result={reply:evidence?
          `已记录「${target.title}」的感受。AI 根据你的原话暂定自然启动等级 ${evidence.level}/4；这只是待校验的解释，不是你亲自选择的评分。`:
          `已保存「${target.title}」的原话感受。由于缺少明确依据，AI 没有擅自给出自然启动评分。`,
          change:{kind:"reflection_recorded",habitId:target.id,habitTitle:target.title},
          progress:null};
      }else if(command.intent==="check_progress" && command.target){
        const target=await tx.habit.findFirst({where:{id:command.target.id,userId,archivedAt:null},
          select:{id:true,title:true,reviewEnabled:true}});
        if(!target)throw new ApiError(404,"HABIT_NOT_FOUND");
        const [completed,eligible,last,notes]=await Promise.all([
          tx.habitEvent.count({where:{habitId:target.id,eligible:true,completed:true}}),
          tx.habitEvent.count({where:{habitId:target.id,eligible:true}}),
          tx.habitEvent.findFirst({where:{habitId:target.id,completed:true},
            orderBy:{occurredAt:"desc"},select:{occurredAt:true}}),
          tx.habitReflection.findMany({where:{habitId:target.id},orderBy:{createdAt:"desc"},
            take:80,select:{createdAt:true,initiationLevel:true,aiStatus:true,aiLevel:true,aiConfidence:true}})
        ]);
        const observations:InitiationEvidence[]=[];
        for(const r of notes){
          if(r.initiationLevel!==null){
            observations.push({atMs:r.createdAt.getTime(),
              level:r.initiationLevel as 0|1|2|3|4,
              source:"self_report",confidence:1});
          }else if(r.aiStatus==="COMPLETED"&&r.aiLevel!==null&&r.aiConfidence!==null){
            observations.push({atMs:r.createdAt.getTime(),
              level:r.aiLevel as 0|1|2|3|4,
              source:"ai_interpretation",confidence:r.aiConfidence});
          }
        }
        const status=calculateHabitProgress({completedRepetitions:completed,
          eligibleOpportunities:eligible,completedOpportunities:completed,
          observations,nowMs:Date.now(),lastCompletedAtMs:last?.occurredAt.getTime()??null,
          seed:target.id,reviewEnabled:target.reviewEnabled});
        result={reply:`「${target.title}」已执行 ${completed} 次；实验性成长指标 ${status.progress.toFixed(1)}%。${status.evidenceStale?" 最近的感受证据已过时，建议简短复查。":""}这不是习惯形成概率，也不代表能力自动提高。`,
          change:null,progress:{habitId:target.id,percent:status.progress,
            repetitions:completed,evidenceStale:status.evidenceStale}};
      }else if(command.intent==="clarify"){
        result.reply=limitText(command.reply||"请再说具体一点，我不会在不确定时修改记录。");
      }
      await tx.assistantAction.create({data:{userId,requestId,messageDigest:digest,intent:command.intent,
        result:JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue}});
      return result;
    });
  }catch(e){
    // A competing identical request can win the unique receipt insert while
    // this transaction rolls back, even after performing local (rolled-back) writes.
    const recorded=await db.assistantAction.findUnique({where:key,
      select:{messageDigest:true,result:true}});
    if(recorded){
      if(recorded.messageDigest!==digest)throw new ApiError(409,"ASSISTANT_REQUEST_ID_REUSED");
      return recorded.result as AssistantResult;
    }
    throw e;
  }
}
