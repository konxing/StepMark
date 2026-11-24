import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";

export const runtime="nodejs";
type Context={params:Promise<{id:string;reflectionId:string}>};
const selfRatingSchema=z.object({initiationLevel:z.number().int().min(0).max(4)}).strict();

async function target(request:NextRequest,context:Context){
  const principal=await principalFromRequest(request);
  if(principal.kind==="WEB")requireSameOrigin(request);
  const {id,reflectionId}=await context.params;
  if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(reflectionId).success)
    throw new ApiError(404,"NOT_FOUND");
  await enforceRateLimit("reflection-control-user",principal.userId,30,24*60*60*1000);
  const existing=await getDb().habitReflection.findFirst({
    where:{id:reflectionId,habitId:id,habit:{userId:principal.userId}},
    select:{id:true,aiStatus:true,aiConsent:true}
  });
  if(!existing)throw new ApiError(404,"NOT_FOUND");
  return {id,reflectionId,existing,userId:principal.userId};
}

/** Add the user's own rating to a completed action without changing its note or AI annotation. */
export async function POST(request:NextRequest,context:Context){
  try{
    const {id,reflectionId,userId}=await target(request,context);
    const {initiationLevel}=await boundedJson(request,selfRatingSchema,512);
    const db=getDb();
    const where={id:reflectionId,habitId:id,habit:{userId,archivedAt:null},event:{habitId:id,eligible:true,completed:true}};
    const updated=await db.habitReflection.updateMany({
      where:{...where,initiationLevel:null},data:{initiationLevel}
    });
    if(updated.count===0){
      const recorded=await db.habitReflection.findFirst({where,select:{initiationLevel:true}});
      if(!recorded)throw new ApiError(409,"SELF_RATING_REQUIRES_COMPLETED_ACTION");
      if(recorded.initiationLevel!==initiationLevel)throw new ApiError(409,"SELF_RATING_ALREADY_RECORDED");
    }
    return NextResponse.json({initiationLevel},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}

/**
 * Revoke consent for future processing and discard derived AI fields.
 * A request that is currently PROCESSING must report 409, not falsely promise
 * cancellation of an upstream request that may already have been sent.
 */
export async function PATCH(request:NextRequest,context:Context){
  try{
    const {id,reflectionId,existing}=await target(request,context);
    if(existing.aiStatus==="PROCESSING")throw new ApiError(409,"AI_REQUEST_ALREADY_IN_FLIGHT");
    const result=await getDb().habitReflection.updateMany({
      where:{id:reflectionId,habitId:id,aiStatus:{not:"PROCESSING"}},
      data:{aiConsent:false,aiStatus:"DISABLED",aiLevel:null,aiConfidence:null,
        aiQuote:null,aiModelId:null,aiPromptVersion:null}
    });
    if(!result.count)throw new ApiError(409,"AI_REQUEST_ALREADY_IN_FLIGHT");
    return NextResponse.json({ok:true,
      mayHaveBeenSentToProvider:existing.aiStatus==="COMPLETED"||existing.aiStatus==="FAILED",
      message:"Consent for further processing revoked. Previously transmitted text cannot be recalled."
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}

/** Delete first-party diary and annotation; do not claim third-party erasure. */
export async function DELETE(request:NextRequest,context:Context){
  try{
    const {id,reflectionId,existing}=await target(request,context);
    if(existing.aiStatus==="PROCESSING")throw new ApiError(409,"AI_REQUEST_ALREADY_IN_FLIGHT");
    const result=await getDb().habitReflection.deleteMany({
      where:{id:reflectionId,habitId:id,aiStatus:{not:"PROCESSING"}}
    });
    if(!result.count)throw new ApiError(409,"AI_REQUEST_ALREADY_IN_FLIGHT");
    return NextResponse.json({ok:true,deletedFromStepMark:true,
      mayHaveBeenSentToProvider:existing.aiStatus==="COMPLETED"||existing.aiStatus==="FAILED"
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}

/** WeChat clients use PUT, with identical authorization and CSRF rules. */
export const PUT=PATCH;
