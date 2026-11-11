import {calculateHabitProgress,type InitiationEvidence} from "@stepmark/core";
import {getDb} from "./db";

/**
 * One owner-scoped habits query with bounded nested reflections and two batched
 * aggregate queries. No per-habit database waterfall and no external AI calls.
 */
export async function listDueHabitReviews(userId:string,now:Date=new Date()){
  const db=getDb();
  const habits=await db.habit.findMany({
    where:{userId,archivedAt:null,reviewEnabled:true},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,
    select:{id:true,title:true,reviewEnabled:true,
      reflections:{where:{createdAt:{gte:new Date(now.getTime()-120*86400000)}},
        orderBy:{createdAt:"desc"},take:60,
        select:{createdAt:true,initiationLevel:true,aiLevel:true,aiConfidence:true,aiStatus:true}}}
  });
  const ids=habits.map(h=>h.id);
  if(!ids.length)return {due:[],totalDue:0};
  const [counts,lastEvent]=await Promise.all([
    db.habitEvent.groupBy({
      by:["habitId","eligible","completed"],
      where:{habitId:{in:ids}},_count:{_all:true}
    }),
    db.habitEvent.groupBy({
      by:["habitId"],where:{habitId:{in:ids},completed:true},_max:{occurredAt:true}
    })
  ]);
  const countMap=new Map<string,{eligible:number;done:number}>();
  for(const row of counts){
    const v=countMap.get(row.habitId)??{eligible:0,done:0};
    if(row.eligible){
      v.eligible+=row._count._all;
      if(row.completed)v.done+=row._count._all;
    }
    countMap.set(row.habitId,v);
  }
  const lastMap=new Map(lastEvent.map(row=>[row.habitId,row._max.occurredAt?.getTime()??null]));
  const due: {habitId:string;title:string;progress:number;reviewReason:string;nextReviewAt:string}[]=[];
  for(const habit of habits){
    const count=countMap.get(habit.id)??{eligible:0,done:0};
    const observations:InitiationEvidence[]=[];
    for(const x of habit.reflections){
      if(x.initiationLevel!==null){
        observations.push({atMs:x.createdAt.getTime(),level:x.initiationLevel as 0|1|2|3|4,
          source:"self_report",confidence:1});
      }else if(x.aiStatus==="COMPLETED"&&x.aiLevel!==null){
        observations.push({atMs:x.createdAt.getTime(),level:x.aiLevel as 0|1|2|3|4,
          source:"ai_interpretation",confidence:x.aiConfidence??0});
      }
    }
    const status=calculateHabitProgress({
      completedRepetitions:count.done,completedOpportunities:count.done,
      eligibleOpportunities:count.eligible,nowMs:now.getTime(),
      observations,lastCompletedAtMs:lastMap.get(habit.id)??null,seed:habit.id
    });
    if(status.reviewDue&&status.nextReviewAt){
      due.push({habitId:habit.id,title:habit.title,progress:status.progress,
        reviewReason:status.reviewReason,nextReviewAt:status.nextReviewAt});
    }
  }
  due.sort((a,b)=>a.nextReviewAt.localeCompare(b.nextReviewAt)||a.habitId.localeCompare(b.habitId));
  return {due:due.slice(0,10),totalDue:due.length};
}
