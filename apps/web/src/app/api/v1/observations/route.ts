import {NextRequest,NextResponse} from "next/server";
import {observationSchema} from "@stepmark/contracts";
import {z} from "zod";
import {getDb} from "@/server/db";
import {findOwnHabit,listOwnEvents} from "@/server/habit-service";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    const habitId=new URL(request.url).searchParams.get("habitId")??"";
    if(!z.uuid().safeParse(habitId).success)throw new ApiError(400,"INVALID_HABIT_ID");
    const events=await listOwnEvents(p.userId,habitId);
    if(!events)throw new ApiError(404,"NOT_FOUND");
    return NextResponse.json({events},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    if(p.kind==="WEB")requireSameOrigin(request);
    const input=await boundedJson(request,observationSchema);
    if(!input.eligible && input.completed)throw new ApiError(400,"INELIGIBLE_COMPLETION");
    const timestamp=new Date(input.occurredAt).getTime();
    if(timestamp>Date.now()+5*60*1000 || timestamp<Date.now()-90*24*60*60*1000)throw new ApiError(400,"DATE_OUT_OF_RANGE");
    await enforceRateLimit("observation-user",p.userId,180,60*60*1000);
    const own=await findOwnHabit(p.userId,input.habitId);
    if(!own)throw new ApiError(404,"NOT_FOUND");
    const db=getDb();
    const existing=await db.habitEvent.findUnique({where:{
      habitId_opportunityKey:{habitId:own.id,opportunityKey:input.opportunityKey}
    }});
    if(existing){
      // Requests are idempotent; conflicting replays are not silently overwritten.
      const same=existing.eligible===input.eligible && existing.completed===input.completed;
      if(!same)throw new ApiError(409,"OPPORTUNITY_CONFLICT");
      return NextResponse.json({event:existing,replayed:true},{headers:{"Cache-Control":"no-store"}});
    }
    let event;
    try{
      event=await db.habitEvent.create({data:{
        habitId:own.id,opportunityKey:input.opportunityKey,eligible:input.eligible,
        completed:input.completed,occurredAt:new Date(input.occurredAt),
        source:p.kind==="WEB"?"web":"wechat"
      }});
    }catch(error){
      // Concurrent double-submissions should never create two events.
      const raced=await db.habitEvent.findUnique({where:{
        habitId_opportunityKey:{habitId:own.id,opportunityKey:input.opportunityKey}
      }});
      if(!raced)throw error;
      const same=raced.eligible===input.eligible && raced.completed===input.completed;
      if(!same)throw new ApiError(409,"OPPORTUNITY_CONFLICT");
      return NextResponse.json({event:raced,replayed:true},{headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({event,replayed:false},{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
