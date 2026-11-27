import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {getLogicFormOverview,RETEST_WAIT_DAYS} from "@/server/assessment-forms";
import {getDb} from "@/server/db";
import {findOwnHabit} from "@/server/habit-service";
import {logicTrainingConstruct,readLogicTrainingCounts} from "@/server/habit-training-evidence";
import {ApiError, boundedJson, enforceRateLimit, errorResponse, principalFromRequest, requireSameOrigin} from "@/server/security";

export const runtime="nodejs";
const constructCode=logicTrainingConstruct;
const targetInput=z.object({target:z.literal(constructCode).nullable()}).strict();
const headers={"Cache-Control":"private, no-store"};
type Context={params:Promise<{id:string}>};

export async function GET(request:NextRequest,context:Context){
  try{
    const {userId}=await principalFromRequest(request);
    const {id}=await context.params;
    if(!z.uuid().safeParse(id).success||!await findOwnHabit(userId,id))throw new ApiError(404,"NOT_FOUND");
    const db=getDb();
    const target=await db.habitAssociation.findUnique({
      where:{habitId_constructCode:{habitId:id,constructCode}},
      select:{updatedAt:true}
    });
    if(!target)return NextResponse.json({target:null},{headers});

    const now=new Date();
    const overview=await getLogicFormOverview(userId,now);
    const [baseline,retest]=overview.forms;
    const end=retest?.startedAt?new Date(retest.startedAt):now;
    const observations=(await readLogicTrainingCounts([id],baseline?.completedAt??null,end)).get(id)??null;
    const retestWait=RETEST_WAIT_DAYS*86400000;
    const comparison=(observations??0)>0&&baseline?.integrityStatus==="verified"&&retest?.integrityStatus==="verified"&&
      baseline.completedAt&&retest.startedAt&&Date.parse(retest.startedAt)-Date.parse(baseline.completedAt)>=retestWait?
      overview.measurementEvidence.rawComparison:null;
    const summarize=(form:(typeof overview.forms)[number])=>({
      status:form.status,correct:form.correct,total:form.total,integrity:form.integrityStatus,
      completedAt:form.completedAt,availableAt:form.availableAt
    });
    return NextResponse.json({
      target:constructCode,linkedAt:target.updatedAt,
      baseline:baseline?summarize(baseline):null,retest:retest?summarize(retest):null,
      recordedTrainingBetweenTests:observations,
      rawDifferencePoints:comparison?.rawDifferencePoints??null
    },{headers});
  }catch(error){return errorResponse(error);}
}

export async function PUT(request:NextRequest,context:Context){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB")requireSameOrigin(request);
    const {id}=await context.params;
    if(!z.uuid().safeParse(id).success||!await findOwnHabit(principal.userId,id))throw new ApiError(404,"NOT_FOUND");
    const {target}=await boundedJson(request,targetInput,256);
    await enforceRateLimit("habit-training-link",principal.userId,40,60*60*1000);

    const db=getDb();
    if(target===null){
      await db.habitAssociation.deleteMany({where:{habitId:id,constructCode}});
    }else{
      const construct=await db.construct.findUnique({where:{code:constructCode},select:{code:true}});
      if(!construct)throw new ApiError(409,"TRAINING_TARGET_UNAVAILABLE");
      // A repeated save leaves the start of the observation window intact.
      await db.habitAssociation.createMany({skipDuplicates:true,data:[{
        habitId:id,constructCode,hypothesis:"The owner chose this habit to practise logical reasoning.",
        evidenceLevel:"user_selected"
      }]});
    }
    return NextResponse.json({target},{headers});
  }catch(error){return errorResponse(error);}
}
