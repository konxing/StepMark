import {NextRequest,NextResponse} from "next/server";
import {choiceSubmissionSchema,singleChoiceContentSchema} from "@stepmark/contracts";
import {evaluateSingleChoice} from "@stepmark/core";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    const attempts=await getDb().assessmentAttempt.findMany({where:{userId:p.userId},orderBy:{createdAt:"desc"},take:40,
      select:{id:true,taskId:true,taskVersion:true,evidenceKind:true,rawScore:true,createdAt:true}});
    return NextResponse.json({attempts},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    if(p.kind==="WEB")requireSameOrigin(request);
    const {taskId,selectedKey}=await boundedJson(request,choiceSubmissionSchema);
    await enforceRateLimit("assessment-user",p.userId,40,60*60*1000);
    const db=getDb();
    const task=await db.task.findFirst({where:{id:taskId,publishedAt:{lte:new Date()}},
      select:{id:true,version:true,content:true}});
    if(!task)throw new ApiError(404,"TASK_NOT_FOUND");
    const definition=singleChoiceContentSchema.safeParse(task.content);
    if(!definition.success)throw new ApiError(503,"TASK_DEFINITION_INVALID");
    let result;
    try{result=evaluateSingleChoice(definition.data,selectedKey);}
    catch{throw new ApiError(400,"INVALID_ANSWER");}
    let attempt;
    try{
      attempt=await db.assessmentAttempt.create({data:{
        userId:p.userId,taskId:task.id,taskVersion:task.version,
        evidenceKind:"OBJECTIVE",rawScore:result.taskScore,
        evidence:{selectedKey,correct:result.isCorrect,scorerVersion:result.scorerVersion}
      },select:{id:true,createdAt:true}});
    }catch(error){
      const existing=await db.assessmentAttempt.findFirst({where:{userId:p.userId,taskId:task.id},
        select:{id:true}});
      if(existing)throw new ApiError(409,"TASK_ALREADY_SUBMITTED");
      throw error;
    }
    return NextResponse.json({attemptId:attempt.id,taskScore:result.taskScore,
      correct:result.isCorrect,explanation:definition.data.explanation,
      notice:"Task-level raw performance only. Not a validated capacity score."},
      {status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
