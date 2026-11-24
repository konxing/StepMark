import {calculateHabitProgress} from "@stepmark/core";
import {getDb} from "./db";
import {habitSelfRatingEvidence,readHabitOpportunityCounts,recentHabitSelfRatings} from "./habit-service";

/**
 * One owner-scoped habits query with bounded reflections and one batched
 * aggregate query.
 */
export async function listDueHabitReviews(userId:string,now:Date=new Date()){
  const db=getDb();
  const habits=await db.habit.findMany({
    where:{userId,archivedAt:null,reviewEnabled:true},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,
    select:{id:true,title:true,reviewEnabled:true,
      reflections:recentHabitSelfRatings}
  });
  const ids=habits.map(h=>h.id);
  if(!ids.length)return {due:[],totalDue:0};
  const counts=await readHabitOpportunityCounts(db,ids);
  const due: {habitId:string;title:string;progress:number;reviewReason:string;nextReviewAt:string}[]=[];
  for(const habit of habits){
    const {completed,eligible,lastCompletedAtMs,recentOpportunities}=counts.get(habit.id)!;
    const status=calculateHabitProgress({
      completedRepetitions:completed,completedOpportunities:completed,
      eligibleOpportunities:eligible,nowMs:now.getTime(),
      observations:habitSelfRatingEvidence(habit.reflections),lastCompletedAtMs,recentOpportunities,seed:habit.id
    });
    if(status.reviewDue&&status.nextReviewAt){
      due.push({habitId:habit.id,title:habit.title,progress:status.progress,
        reviewReason:status.reviewReason,nextReviewAt:status.nextReviewAt});
    }
  }
  due.sort((a,b)=>a.nextReviewAt.localeCompare(b.nextReviewAt)||a.habitId.localeCompare(b.habitId));
  return {due:due.slice(0,10),totalDue:due.length};
}
