import {NextRequest,NextResponse} from "next/server";
import {practiceResponseSchema} from "@stepmark/contracts";
import {getDb} from "@/server/db";
import {getLogicFormOverview,SKILLS} from "@/server/assessment-forms";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin}
 from "@/server/security";
import {getPracticeSchedule,findPracticeItem,publicPracticeItem,PRACTICE_BANK_VERSION,
 PRACTICE_SKILLS,type PracticeSkill} from "@/server/practice-bank";
export const runtime="nodejs";

/** Coaching is not part of either scored form; no practice row enters AssessmentAttempt. */
export async function GET(request:NextRequest){
 try{
  const principal=await principalFromRequest(request);
  const requested=new URL(request.url).searchParams.get("skill");
  if(requested!==null && !PRACTICE_SKILLS.some(s=>s.code===requested))
    throw new ApiError(400,"INVALID_PRACTICE_SKILL");
  const [forms,history]=await Promise.all([
   getLogicFormOverview(principal.userId),
   getDb().practiceAttempt.findMany({
    where:{userId:principal.userId},orderBy:{createdAt:"desc"},take:300,
    select:{itemId:true,correct:true,hintUsed:true,dayKey:true,createdAt:true}
   })
  ]);
  const completed=[...forms.forms].reverse().find(f=>f.status==="completed");
  const byScore=PRACTICE_SKILLS.map(s=>({
   ...s,wrong:completed?completed.dimensions.find(d=>d.code===s.code)?.total!-
    completed.dimensions.find(d=>d.code===s.code)?.correct!:null
  }));
  byScore.sort((a,b)=>(b.wrong??-1)-(a.wrong??-1));
  const recommendedSkill=byScore[0]!.code;
  const skill=(requested??recommendedSkill) as PracticeSkill;
  const utcDay=new Date().toISOString().slice(0,10);
  const plan=getPracticeSchedule(skill,history,utcDay);
  const task=plan.item;
  const totals=PRACTICE_SKILLS.map(s=>({
   code:s.code,label:s.label,
   recentlyAnswered:history.filter(h=>findPracticeItem(h.itemId)?.skillCode===s.code).length,
   recentCorrect:history.filter(h=>h.correct && findPracticeItem(h.itemId)?.skillCode===s.code).length,
   unassistedCorrect:history.filter(h=>h.correct && h.hintUsed===false &&
     findPracticeItem(h.itemId)?.skillCode===s.code).length,
   assistedOrUnknown:history.filter(h=>h.hintUsed!==false &&
     findPracticeItem(h.itemId)?.skillCode===s.code).length,
   wrongInLastCompletedForm:completed?.dimensions.find(d=>d.code===s.code)?.correct===null?null:
    completed ? 2-completed.dimensions.find(d=>d.code===s.code)!.correct!:null
  }));
  return NextResponse.json({recommendedSkill:completed?recommendedSkill:null,skill,
   recommendationBasis:completed?"latest_completed_form_errors":"no_completed_form",
   lastFormCode:completed?.code??null,skills:totals,
   item:task?publicPracticeItem(task):null,practiceBankVersion:PRACTICE_BANK_VERSION,
   todayUtc:utcDay,nextReviewUtc:plan.nextReviewUtc,
   dueReviewsToday:plan.dueCount,spacingPolicyVersion:plan.policyVersion,
   notice:"Independent original training questions only. Practice answers are not scored assessment evidence; " +
    "two items per domain cannot establish an ability diagnosis."},
    {headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
 try{
  const principal=await principalFromRequest(request);
  if(principal.kind==="WEB")requireSameOrigin(request);
  const body=await boundedJson(request,practiceResponseSchema);
  const item=findPracticeItem(body.itemId);
  if(!item)throw new ApiError(404,"PRACTICE_ITEM_NOT_FOUND");
  await enforceRateLimit("practice-submit",principal.userId,40,24*60*60*1000);
  const utcDay=new Date().toISOString().slice(0,10);
  const db=getDb();
  const key={userId:principal.userId,itemId:item.id,dayKey:utcDay};
  const existing=await db.practiceAttempt.findUnique({
    where:{userId_itemId_dayKey:key},select:{id:true}
  });
  if(existing)throw new ApiError(409,"ALREADY_PRACTICED_TODAY");
  const correct=body.selectedKey===item.answerKey;
  let record;
  try{
   record=await db.practiceAttempt.create({
    data:{...key,bankVersion:PRACTICE_BANK_VERSION,
     selectedKey:body.selectedKey,correct,hintUsed:body.hintUsed??null},
    select:{id:true,createdAt:true}
   });
  }catch(error){
   const raced=await db.practiceAttempt.findUnique({
    where:{userId_itemId_dayKey:key},select:{id:true}
   });
   if(raced)throw new ApiError(409,"ALREADY_PRACTICED_TODAY");
   throw error;
  }
  return NextResponse.json({attemptId:record.id,correct,selectedKey:body.selectedKey,
   answerKey:item.answerKey,explanation:item.explanation,skillCode:item.skillCode,
   hintUsed:body.hintUsed??null,
   bankVersion:PRACTICE_BANK_VERSION,createdAt:record.createdAt,
   notice:"Coaching feedback is immediate; independent A/B scores and ability estimates are unchanged."},
   {status:201,headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return errorResponse(error);}
}
