import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
import {validateClientLocalDate} from "@/server/assistant-command";
import {WORK_EVIDENCE_RUBRIC,workDomains,workEvidenceSelect} from "@/server/work-evidence";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const pageSize=12;

export async function GET(request:NextRequest){
  try{
    const {userId}=await principalFromRequest(request);
    const rawOffset=request.nextUrl.searchParams.get("offset")??"0";
    if(!/^(0|[1-9]\d{0,4})$/u.test(rawOffset))throw new ApiError(400,"INVALID_OFFSET");
    const offset=Number(rawOffset);
    const now=new Date();
    const localDate=request.nextUrl.searchParams.get("localDate")??now.toISOString().slice(0,10);
    try{validateClientLocalDate(localDate,now);}catch{throw new ApiError(400,"INVALID_LOCAL_DATE");}
    const start=new Date(localDate+"T00:00:00.000Z");
    start.setUTCDate(start.getUTCDate()-29);
    const firstDay=start.toISOString().slice(0,10);
    const db=getDb();
    const [items,rows]=await Promise.all([
      db.workEvidence.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],
        skip:offset,take:pageSize+1,select:workEvidenceSelect}),
      // Keep the earliest report when older data contains the same action
      // under multiple domains. Summaries stay inside the reported date window.
      db.$queryRaw<{domain:string;reportedDays:number;outcomeDays:number}[]>`
        SELECT recent."domain", COUNT(DISTINCT recent."reportDay")::int AS "reportedDays",
          COUNT(DISTINCT recent."reportDay") FILTER (
            WHERE recent."stage" = 2 AND recent."rubric" = ${WORK_EVIDENCE_RUBRIC}
          )::int AS "outcomeDays"
        FROM "WorkEvidence" AS recent
        WHERE recent."userId" = ${userId}::uuid
          AND recent."reportDay" BETWEEN ${firstDay} AND ${localDate}
          AND NOT EXISTS (
            SELECT 1
            FROM "WorkEvidence" AS earlier
            WHERE earlier."userId" = recent."userId" AND earlier."digest" = recent."digest"
              AND (earlier."createdAt",earlier."id") < (recent."createdAt",recent."id")
          )
        GROUP BY recent."domain"
      `
    ]);
    const byDomain=new Map(rows.map(row=>[row.domain,row]));
    const summary=Object.entries(workDomains).map(([domain,label])=>{
      const row=byDomain.get(domain);
      return {domain,label,reportedDays:row?.reportedDays??0,outcomeDays:row?.outcomeDays??0};
    });
    const page=items.slice(0,pageSize).map(item=>({...item,
      outcomeNeedsReview:!!item.outcomeQuote&&item.rubric!==WORK_EVIDENCE_RUBRIC}));
    return NextResponse.json({items:page,summary,labels:workDomains,
      nextOffset:items.length>pageSize?offset+pageSize:null},{headers});
  }catch(error){return errorResponse(error);}
}

export async function DELETE(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB")requireSameOrigin(request);
    const id=z.uuid().safeParse(request.nextUrl.searchParams.get("id"));
    if(!id.success)throw new ApiError(404,"NOT_FOUND");
    await enforceRateLimit("work-evidence-delete",principal.userId,40,60*60*1000);
    const result=await getDb().workEvidence.deleteMany({where:{id:id.data,userId:principal.userId}});
    if(!result.count)throw new ApiError(404,"NOT_FOUND");
    return NextResponse.json({ok:true},{headers});
  }catch(error){return errorResponse(error);}
}
