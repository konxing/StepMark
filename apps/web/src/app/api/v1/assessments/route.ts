import {NextRequest,NextResponse} from "next/server";
import {choiceSubmissionSchema,singleChoiceContentSchema} from "@stepmark/contracts";
import {evaluateSingleChoice} from "@stepmark/core";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
import {getLogicFormOverview,isLogicFormCode} from "@/server/assessment-forms";
import {taskContentDigest} from "@/server/assessment-integrity";
import {isAllowedPublicDemoTask} from "@/server/public-assessment-policy";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    const attempts=await getDb().assessmentAttempt.findMany({where:{userId:p.userId},
      orderBy:[{createdAt:"desc"},{id:"desc"}],take:40,
      select:{id:true,taskId:true,taskVersion:true,evidenceKind:true,rawScore:true,createdAt:true,
        task:{select:{formCode:true,version:true}}}});
    // A common score-history endpoint must respect the very same deferred-
    // feedback policy as the form endpoint, not expose item correctness early.
    const overview=attempts.some(a=>a.task.formCode)?await getLogicFormOverview(p.userId):null;
    const statuses=new Map<string,string>(overview?.forms.map(f=>[f.code,f.status])??[]);
    return NextResponse.json({attempts:attempts.map(a=>{
      const released=!a.task.formCode ||
        (statuses.get(a.task.formCode)==="completed"&&a.taskVersion===a.task.version);
      return {id:a.id,taskId:a.taskId,taskVersion:a.taskVersion,
        evidenceKind:a.evidenceKind,rawScore:released?a.rawScore:null,
        scoreDeferred:!released,createdAt:a.createdAt};
    })},{headers:{"Cache-Control":"private, no-store"}});
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
      select:{id:true,version:true,content:true,formCode:true,constructCode:true}});
    if(!task)throw new ApiError(404,"TASK_NOT_FOUND");
    // formCode=null is NOT an authorization to publish any new task.
    // Only the four immutable public demo IDs may use immediate feedback.
    if(task.formCode===null&&!isAllowedPublicDemoTask(task))
      throw new ApiError(404,"TASK_NOT_FOUND");
    if(task.formCode){
      if(!isLogicFormCode(task.formCode))throw new ApiError(503,"FORM_DEFINITION_INVALID");
      const overview=await getLogicFormOverview(p.userId);
      const form=overview.forms.find(f=>f.code===task.formCode);
      if(!form||form.status==="locked"||form.status==="unavailable")
        throw new ApiError(409,"FORM_LOCKED");
    }
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
        evidence:{selectedKey,correct:result.isCorrect,scorerVersion:result.scorerVersion,
          ...(task.formCode?{taskContentSha256:taskContentDigest(task.content)}:{})}
      },select:{id:true,createdAt:true}});
    }catch(error){
      const existing=await db.assessmentAttempt.findFirst({where:{userId:p.userId,taskId:task.id},
        select:{id:true}});
      if(existing)throw new ApiError(409,"TASK_ALREADY_SUBMITTED");
      throw error;
    }
    if(task.formCode){
      // Deferred feedback: revealing answers during a form contaminates later items.
      return NextResponse.json({attemptId:attempt.id,accepted:true,deferredFeedback:true,
        notice:"Answers and explanations become available after this form is fully completed."},
        {status:201,headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({attemptId:attempt.id,taskScore:result.taskScore,
      correct:result.isCorrect,explanation:definition.data.explanation,
      notice:"Task-level raw performance only. Not a validated capacity score."},
      {status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
