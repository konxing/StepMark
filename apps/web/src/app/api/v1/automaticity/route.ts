import {NextRequest,NextResponse} from "next/server";
import {automaticityCheckSchema} from "@stepmark/contracts";
import {automaticityResponseIndex} from "@stepmark/core";
import {getDb} from "@/server/db";
import {findOwnHabit} from "@/server/habit-service";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
export async function POST(request:NextRequest) {
  try{
    const p=await principalFromRequest(request);
    if(p.kind==="WEB")requireSameOrigin(request);
    const input=await boundedJson(request,automaticityCheckSchema);
    if(input.instrumentVersion!=="stepmark-experimental-4-v1")
      throw new ApiError(400,"INSTRUMENT_NOT_SUPPORTED");
    await enforceRateLimit("automaticity-user",p.userId,10,24*60*60*1000);
    const own=await findOwnHabit(p.userId,input.habitId);
    if(!own)throw new ApiError(404,"NOT_FOUND");
    const check=await getDb().automaticityCheck.create({data:{
      habitId:own.id,instrumentVersion:input.instrumentVersion,
      responses:input.answers,indexScore:automaticityResponseIndex(input.answers)
    },select:{id:true,indexScore:true,measuredAt:true}});
    return NextResponse.json({check,disclaimer:"Experimental 4-item automaticity proxy; not a validated SRBAI score."},
      {status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
