import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,enforceRateLimit,errorResponse,principalFromRequest} from "@/server/security";

export const runtime="nodejs";
/** Small owner-scoped pages prevent large JSON responses and avoid exposing secrets. */
const kindSchema=z.enum(["habits","events","reflections","automaticity","assessments","estimates","judgements"]);
export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    const params=new URL(request.url).searchParams;
    const kind=kindSchema.safeParse(params.get("kind"));
    if(!kind.success)throw new ApiError(400,"INVALID_EXPORT_KIND");
    const rawOffset=params.get("offset")??"0";
    if(!/^(0|[1-9][0-9]{0,5})$/.test(rawOffset))throw new ApiError(400,"INVALID_OFFSET");
    const offset=Number(rawOffset);
    if(offset>100000)throw new ApiError(400,"OFFSET_TOO_LARGE");
    await enforceRateLimit("export-user",principal.userId,60,60*60*1000);
    const db=getDb();
    const paging={skip:offset,take:101,orderBy:{id:"asc" as const}};
    let data:unknown[];
    switch(kind.data){
      case "habits":
        data=await db.habit.findMany({where:{userId:principal.userId},...paging,
          select:{id:true,title:true,cue:true,action:true,createdAt:true,archivedAt:true}});break;
      case "events":
        data=await db.habitEvent.findMany({where:{habit:{userId:principal.userId}},...paging,
          select:{id:true,habitId:true,opportunityKey:true,eligible:true,completed:true,occurredAt:true,createdAt:true}});break;
      case "reflections":
        data=await db.habitReflection.findMany({where:{habit:{userId:principal.userId}},...paging,
          select:{id:true,habitId:true,eventId:true,note:true,initiationLevel:true,
            aiConsent:true,aiStatus:true,aiLevel:true,aiConfidence:true,aiQuote:true,
            aiModelId:true,aiPromptVersion:true,createdAt:true}});break;
      case "automaticity":
        data=await db.automaticityCheck.findMany({where:{habit:{userId:principal.userId}},...paging,
          select:{id:true,habitId:true,instrumentVersion:true,responses:true,indexScore:true,measuredAt:true}});break;
      case "assessments":
        data=await db.assessmentAttempt.findMany({where:{userId:principal.userId},...paging,
          select:{id:true,taskId:true,taskVersion:true,evidenceKind:true,rawScore:true,evidence:true,deviceInfo:true,createdAt:true}});break;
      case "estimates":
        data=await db.abilityEstimate.findMany({where:{userId:principal.userId},...paging,
          select:{id:true,constructCode:true,estimator:true,modelVersion:true,estimate:true,
            standardError:true,evidenceCount:true,metadata:true,calculatedAt:true}});break;
      case "judgements":
        data=await db.aIJudgement.findMany({where:{attempt:{userId:principal.userId}},...paging,
          select:{id:true,attemptId:true,modelId:true,promptVersion:true,rubricVersion:true,
            evidence:true,reviewStatus:true,createdAt:true}});break;
    }
    const hasMore=data.length>100;
    return NextResponse.json({
      kind:kind.data,items:data.slice(0,100),nextOffset:hasMore?offset+100:null
    },{headers:{
      "Cache-Control":"private, no-store",
      "Content-Disposition":'attachment; filename="stepmark-export.json"',
      "X-Content-Type-Options":"nosniff"
    }});
  }catch(error){return errorResponse(error);}
}
