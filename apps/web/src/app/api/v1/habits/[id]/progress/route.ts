import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {calculateHabitProgress} from "@stepmark/core";
import {getDb} from "@/server/db";
import {habitSelfRatingEvidence,readHabitOpportunityCounts,recentHabitSelfRatings} from "@/server/habit-service";
import {ApiError,errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
/**
 * Owner scoping is mandatory. 120 recent direct ratings evaluated, 12 distinct days retained; no LLM call
 * is made in a latency-sensitive GET. Repetition count alone has a low progress cap.
 */
export async function GET(request:NextRequest,ctx:{params:Promise<{id:string}>}){
  try {
    const p=await principalFromRequest(request);
    const {id}=await ctx.params;
    if(!z.uuid().safeParse(id).success)throw new ApiError(404,"NOT_FOUND");
    const db=getDb();
    const habit=await db.habit.findFirst({where:{id,userId:p.userId,archivedAt:null},
      select:{id:true,reviewEnabled:true}});
    if(!habit)throw new ApiError(404,"NOT_FOUND");
    const [counts,reflections,aiAnnotationCount]=await Promise.all([
      readHabitOpportunityCounts(db,[id]),
      // Fetch DIRECT user-rated evidence independently. A large number of
      // recent AI-only notes must never push historical self-ratings out of
      // the bounded evaluation window.
      db.habitReflection.findMany({...recentHabitSelfRatings,where:{habitId:id,...recentHabitSelfRatings.where}}),
      // AI annotations are descriptive counts only, not rating inputs.
      db.habitReflection.count({where:{habitId:id,initiationLevel:null,
        aiStatus:"COMPLETED",aiLevel:{not:null}}})
    ]);
    const {completed,eligible,lastCompletedAtMs,recentOpportunities}=counts.get(id)!;
    const progress=calculateHabitProgress({completedRepetitions:completed,
      completedOpportunities:completed,eligibleOpportunities:eligible,observations:habitSelfRatingEvidence(reflections),
      nowMs:Date.now(),lastCompletedAtMs,recentOpportunities,
      seed:habit.id,reviewEnabled:habit.reviewEnabled});
    return NextResponse.json({habitId:id,reviewEnabled:habit.reviewEnabled,...progress,
      aiAnnotationCount,aiAnnotationCountScope:"historical_unconfirmed_ai_only"},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
