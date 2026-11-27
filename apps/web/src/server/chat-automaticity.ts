import type {Prisma} from "@/generated/prisma/client";
import {groundedHabitInitiationQuote} from "./habit-annotation-grounding";

/** Ordinal chat evidence, not a calibrated scale or a direct rating. */
export type ChatInitiationRow={
  note:string|null;aiQuote:string|null;aiLevel:number|null;
  event:{occurredAt:Date;opportunityKey:string}|null;
};
export function summarizeChatAutomaticity(rows:readonly ChatInitiationRow[],nowMs:number){
  const days=new Map<string,{level:number;at:number}>();
  for(const row of rows){
    const event=row.event,level=row.aiLevel,at=event?.occurredAt.getTime();
    if(!event||at===undefined||!Number.isFinite(at)||at>nowMs+300000||
      level===null||!Number.isInteger(level)||level<0||level>4||
      !row.note||!row.aiQuote||!groundedHabitInitiationQuote(row.note,row.aiQuote,level))continue;
    const match=/^daily:(\d{4}-\d{2}-\d{2})$/u.exec(event.opportunityKey);
    if(!match)continue;
    const day=match[1]!;
    const date=new Date(day+"T00:00:00.000Z");
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)continue;
    const previous=days.get(day);
    if(!previous||previous.at<at)days.set(day,{level,at});
  }
  const recent=[...days.entries()].sort(([a],[b])=>b.localeCompare(a)).slice(0,12).map(([,v])=>v);
  if(!recent.length)return null;
  const levels=recent.map(v=>v.level).sort((a,b)=>a-b);
  const latest=Math.max(...recent.map(v=>v.at));
  return {policyVersion:"chat-automaticity-v1" as const,days:recent.length,
    medianLow:levels[Math.floor((levels.length-1)/2)]!,
    medianHigh:levels[Math.floor(levels.length/2)]!,
    lastObservedAt:new Date(latest).toISOString(),stale:nowMs-latest>45*86400000};
}

/** Call only after checking the habit belongs to the authenticated user.
 * No model requests, no mutation, no unlinked reflections or non-completed events. */
export async function readChatAutomaticity(db:Pick<Prisma.TransactionClient,"habitReflection">,habitId:string,nowMs:number){
  const rows=await db.habitReflection.findMany({
    where:{habitId,initiationLevel:null,aiStatus:"COMPLETED",aiConsent:true,
      aiLevel:{not:null},aiQuote:{not:null},aiPromptVersion:"conversation-intent-v1",
      event:{eligible:true,completed:true}},
    orderBy:[{event:{occurredAt:"desc"}},{id:"desc"}],take:48,
    select:{note:true,aiQuote:true,aiLevel:true,event:{select:{occurredAt:true,opportunityKey:true}}}
  });
  return summarizeChatAutomaticity(rows,nowMs);
}
