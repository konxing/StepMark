import {getDb} from "./db";
import type {InitiationEvidence,InitiationLevel} from "@stepmark/core";
import type {Prisma} from "@/generated/prisma/client";

/** Active habits must be visible in the standard web/desktop list. */
export const MAX_ACTIVE_HABITS=50;

export const recentHabitSelfRatings={
  where:{initiationLevel:{not:null},OR:[{eventId:null},{event:{eligible:true,completed:true}}]},
  orderBy:[{createdAt:"desc"},{id:"desc"}],take:120,
  select:{createdAt:true,initiationLevel:true,event:{select:{occurredAt:true}}}
} satisfies Prisma.HabitReflectionFindManyArgs;

export function habitSelfRatingEvidence(rows:readonly {
  createdAt:Date;initiationLevel:number|null;event:{occurredAt:Date}|null;
}[]):InitiationEvidence[]{
  const evidence:InitiationEvidence[]=[];
  for(const row of rows){
    const level=row.initiationLevel;
    if(level===null)continue;
    // A late entry should not make a historical linked action look recent.
    evidence.push({atMs:(row.event?.occurredAt??row.createdAt).getTime(),
      level:level as InitiationLevel,source:"self_report",confidence:1});
  }
  return evidence;
}

export async function listOwnHabits(userId:string) {
  // One indexed query. No N+1 event fetches, no cross-user joins.
  return getDb().habit.findMany({
    where:{userId,archivedAt:null},
    orderBy:[{createdAt:"desc"},{id:"desc"}],
    take:MAX_ACTIVE_HABITS,
    select:{id:true,title:true,cue:true,action:true,reviewEnabled:true,createdAt:true,
      _count:{select:{events:true,checks:true}}}
  });
}
export async function findOwnHabit(userId:string,habitId:string) {
  return getDb().habit.findFirst({
    where:{id:habitId,userId,archivedAt:null},select:{id:true}
  });
}
export async function listOwnEvents(userId:string,habitId:string) {
  const own=await findOwnHabit(userId,habitId);
  if(!own)return null;
  return getDb().habitEvent.findMany({
    where:{habitId,habit:{userId}},
    orderBy:[{occurredAt:"desc"},{id:"desc"}],
    take:60,
    select:{id:true,opportunityKey:true,eligible:true,completed:true,occurredAt:true,revision:true}
  });
}
