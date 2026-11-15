import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {calculateHabitProgress,type InitiationEvidence} from "@stepmark/core";
import {getDb} from "@/server/db";
import {ApiError,errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
/**
 * Owner scoping is mandatory. 120 recent direct ratings evaluated, 12 distinct UTC days retained; no LLM call
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
    const [completed,eligible,lastEvent,reflections,aiAnnotationCount]=await Promise.all([
      db.habitEvent.count({where:{habitId:id,eligible:true,completed:true}}),
      db.habitEvent.count({where:{habitId:id,eligible:true}}),
      db.habitEvent.findFirst({where:{habitId:id,completed:true},orderBy:{occurredAt:"desc"},
        select:{occurredAt:true}}),
      // Fetch DIRECT user-rated evidence independently. A large number of
      // recent AI-only notes must never push historical self-ratings out of
      // the bounded evaluation window.
      db.habitReflection.findMany({where:{habitId:id,initiationLevel:{not:null}},
        orderBy:[{createdAt:"desc"},{id:"desc"}],take:120,
        select:{createdAt:true,initiationLevel:true}}),
      // AI annotations are descriptive counts only, not rating inputs.
      db.habitReflection.count({where:{habitId:id,initiationLevel:null,
        aiStatus:"COMPLETED",aiLevel:{not:null}}})
    ]);
    const observations:InitiationEvidence[]=[];
    for(const reflection of reflections){
      if(reflection.initiationLevel!==null) {
        observations.push({atMs:reflection.createdAt.getTime(),level:reflection.initiationLevel as 0|1|2|3|4,
          source:"self_report",confidence:1});
      }
    }
    const progress=calculateHabitProgress({completedRepetitions:completed,
      completedOpportunities:completed,eligibleOpportunities:eligible,observations,
      nowMs:Date.now(),lastCompletedAtMs:lastEvent?.occurredAt.getTime()??null,
      seed:habit.id,reviewEnabled:habit.reviewEnabled});
    return NextResponse.json({habitId:id,reviewEnabled:habit.reviewEnabled,...progress,
      aiAnnotationCount,aiAnnotationCountScope:"historical_unconfirmed_ai_only"},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
