import {getDb} from "./db";
import {HABIT_RECENT_OPPORTUNITY_LIMIT} from "@stepmark/core";
import type {InitiationEvidence,InitiationLevel} from "@stepmark/core";
import {Prisma} from "@/generated/prisma/client";
import {z} from "zod";

/** Active habits must be visible in the standard web/desktop list. */
export const MAX_ACTIVE_HABITS=50;

export const recentHabitSelfRatings={
  where:{initiationLevel:{not:null},OR:[{eventId:null},{event:{eligible:true,completed:true}}]},
  orderBy:[{createdAt:"desc"},{id:"desc"}],take:120,
  select:{createdAt:true,initiationLevel:true,event:{select:{occurredAt:true,opportunityKey:true}}}
} satisfies Prisma.HabitReflectionFindManyArgs;

const localDateSchema=z.iso.date();

export function habitSelfRatingEvidence(rows:readonly {
  createdAt:Date;initiationLevel:number|null;event:{occurredAt:Date;opportunityKey:string}|null;
}[]):InitiationEvidence[]{
  const evidence:InitiationEvidence[]=[];
  for(const row of rows){
    const level=row.initiationLevel;
    if(level===null)continue;
    // A late entry should not make a historical linked action look recent.
    const opportunityKey=row.event?.opportunityKey;
    const localDate=opportunityKey?.startsWith("daily:")?
      localDateSchema.safeParse(opportunityKey.slice("daily:".length)).data:undefined;
    evidence.push({atMs:(row.event?.occurredAt??row.createdAt).getTime(),localDate,
      level:level as InitiationLevel,source:"self_report",confidence:1});
  }
  return evidence;
}

type OpportunityCounts={
  eligible:number;completed:number;lastCompletedAtMs:number|null;
  recentOpportunities:{eligible:number;completed:number};
};

/** One query keeps the numerator and denominator on the same snapshot. */
export async function readHabitOpportunityCounts(
  db:Pick<Prisma.TransactionClient,"$queryRaw">,habitIds:string[]
):Promise<Map<string,OpportunityCounts>>{
  const counts=new Map<string,OpportunityCounts>(
    habitIds.map(id=>[id,{eligible:0,completed:0,lastCompletedAtMs:null,recentOpportunities:{eligible:0,completed:0}}])
  );
  if(!habitIds.length)return counts;
  const ids=Prisma.join(habitIds.map(id=>Prisma.sql`${id}::uuid`));
  const groups=await db.$queryRaw<{
    habitId:string;eligible:number;completed:number;lastCompletedAt:Date|null;recentEligible:number;recentCompleted:number;
  }[]>`
    SELECT total.*, sample."recentEligible", sample."recentCompleted"
    FROM (
      SELECT "habitId", COUNT(*)::int AS eligible,
        (COUNT(*) FILTER (WHERE completed))::int AS completed,
        MAX("occurredAt") FILTER (WHERE completed) AS "lastCompletedAt"
      FROM "HabitEvent"
      WHERE "habitId" IN (${ids}) AND eligible
      GROUP BY "habitId"
    ) AS total
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS "recentEligible",
        (COUNT(*) FILTER (WHERE completed))::int AS "recentCompleted"
      FROM (
        SELECT completed FROM "HabitEvent" AS event
        WHERE event."habitId"=total."habitId" AND eligible
        ORDER BY "occurredAt" DESC, id DESC
        LIMIT ${HABIT_RECENT_OPPORTUNITY_LIMIT}
      ) AS recent
    ) AS sample
  `;
  for(const group of groups){
    counts.set(group.habitId,{
      eligible:group.eligible,completed:group.completed,lastCompletedAtMs:group.lastCompletedAt?.getTime()??null,
      recentOpportunities:{eligible:group.recentEligible,completed:group.recentCompleted}
    });
  }
  return counts;
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
