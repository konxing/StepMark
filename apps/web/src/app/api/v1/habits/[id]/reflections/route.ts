import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {habitReflectionSchema} from "@stepmark/contracts";
import {getDb} from "@/server/db";
import {findOwnHabit} from "@/server/habit-service";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";

export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
async function owned(request:NextRequest,ctx:Context){
  const p=await principalFromRequest(request);
  const {id}=await ctx.params;
  if(!z.uuid().safeParse(id).success || !(await findOwnHabit(p.userId,id)))
    throw new ApiError(404,"NOT_FOUND");
  return {habitId:id,principal:p};
}
export async function GET(request:NextRequest,ctx:Context){
  try {
    const {habitId}=await owned(request,ctx);
    const rows=await getDb().habitReflection.findMany({
      where:{habitId},orderBy:{createdAt:"desc"},take:30,
      select:{id:true,eventId:true,createdAt:true,note:true,initiationLevel:true,
        aiConsent:true,aiStatus:true,aiLevel:true,aiConfidence:true,aiQuote:true,
        aiModelId:true,aiPromptVersion:true}
    });
    return NextResponse.json({reflections:rows},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest,ctx:Context){
  try {
    const {habitId,principal:p}=await owned(request,ctx);
    if(p.kind==="WEB") requireSameOrigin(request);
    const body=await boundedJson(request,habitReflectionSchema,4096);
    await enforceRateLimit("reflection-user",p.userId,30,24*60*60*1000);
    const db=getDb();
    if(body.eventId){
      const event=await db.habitEvent.findFirst({
        where:{id:body.eventId,habitId,completed:true,habit:{userId:p.userId}},
        select:{id:true}
      });
      if(!event)throw new ApiError(404,"EVENT_NOT_FOUND");
    }else {
      // Stand-alone review: cap repeated same-day introspection per habit.
      const start=new Date();
      start.setUTCHours(0,0,0,0);
      const count=await db.habitReflection.count({where:{habitId,eventId:null,createdAt:{gte:start}}});
      if(count>=2)throw new ApiError(429,"REVIEW_LIMIT");
    }
    const status=body.aiConsent && body.note && process.env.AI_HABIT_API_KEY && process.env.AI_HABIT_MODEL &&
      (process.env.AI_HABIT_PROVIDER==="openai"||process.env.AI_HABIT_PROVIDER==="openrouter")
      ?"PENDING":"DISABLED";
    let row;
    try {
      row=await db.habitReflection.create({data:{
        habitId,eventId:body.eventId??null,note:body.note??null,
        initiationLevel:body.initiationLevel??null,aiConsent:body.aiConsent,aiStatus:status
      },select:{id:true,initiationLevel:true,aiStatus:true,createdAt:true}});
    }catch(error){
      if(body.eventId) {
        const previous=await db.habitReflection.findUnique({where:{eventId:body.eventId},
          select:{id:true}});
        if(previous)throw new ApiError(409,"REFLECTION_ALREADY_EXISTS");
      }
      throw error;
    }
    return NextResponse.json({reflection:row,
      message:status==="PENDING"?"AI review queued; progress uses user-provided ratings immediately.":
        body.aiConsent?"AI not configured; no note was sent outside the server.":"Saved without external AI transfer."
    },{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
