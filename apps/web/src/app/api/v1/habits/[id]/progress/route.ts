import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {calculateHabitProgress,type InitiationEvidence} from "@stepmark/core";
import {getDb} from "@/server/db";
import {ApiError,errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
/**
 * Owner scoping is mandatory. Computation is bounded (12 daily notes); no LLM call
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
    const [completed,eligible,lastEvent,reflections]=await Promise.all([
      db.habitEvent.count({where:{habitId:id,eligible:true,completed:true}}),
      db.habitEvent.count({where:{habitId:id,eligible:true}}),
      db.habitEvent.findFirst({where:{habitId:id,completed:true},orderBy:{occurredAt:"desc"},
        select:{occurredAt:true}}),
      db.habitReflection.findMany({where:{habitId:id},
        orderBy:{createdAt:"desc"},take:80,
        select:{createdAt:true,initiationLevel:true,aiLevel:true,aiConfidence:true,aiStatus:true}})
    ]);
    const observations:InitiationEvidence[]=[];
    for(const reflection of reflections){
      if(reflection.initiationLevel!==null) {
        observations.push({atMs:reflection.createdAt.getTime(),level:reflection.initiationLevel as 0|1|2|3|4,
          source:"self_report",confidence:1});
      }else if(reflection.aiStatus==="COMPLETED" && reflection.aiLevel!==null) {
        observations.push({atMs:reflection.createdAt.getTime(),level:reflection.aiLevel as 0|1|2|3|4,
          source:"ai_interpretation",confidence:reflection.aiConfidence??0});
      }
    }
    const progress=calculateHabitProgress({completedRepetitions:completed,
      completedOpportunities:completed,eligibleOpportunities:eligible,observations,
      nowMs:Date.now(),lastCompletedAtMs:lastEvent?.occurredAt.getTime()??null,
      seed:habit.id,reviewEnabled:habit.reviewEnabled});
    return NextResponse.json({habitId:id,reviewEnabled:habit.reviewEnabled,...progress},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
