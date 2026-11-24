import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
import {workDomains,workEvidenceSelect} from "@/server/work-evidence";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const pageSize=12;

export async function GET(request:NextRequest){
  try{
    const {userId}=await principalFromRequest(request);
    const rawOffset=request.nextUrl.searchParams.get("offset")??"0";
    if(!/^(0|[1-9]\d{0,4})$/u.test(rawOffset))throw new ApiError(400,"INVALID_OFFSET");
    const offset=Number(rawOffset);
    const db=getDb();
    const [items,rows]=await Promise.all([
      db.workEvidence.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],
        skip:offset,take:pageSize+1,select:workEvidenceSelect}),
      db.workEvidence.groupBy({by:["domain","reportDay"],where:{userId,createdAt:{gte:new Date(Date.now()-30*86400000)}},
        _max:{stage:true}})
    ]);
    const summary=Object.entries(workDomains).map(([domain,label])=>{
      const days=rows.filter(row=>row.domain===domain);
      return {domain,label,reportedDays:days.length,outcomeDays:days.filter(row=>row._max.stage===2).length};
    });
    return NextResponse.json({items:items.slice(0,pageSize),summary,labels:workDomains,
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
