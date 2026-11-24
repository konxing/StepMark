import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/server/db";
import {createGrowthPractice,growthPracticeSelect} from "@/server/growth-practice";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const pageSize=20;

export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    const rawOffset=request.nextUrl.searchParams.get("offset")??"0";
    if(!/^(0|[1-9][0-9]{0,5})$/.test(rawOffset))throw new ApiError(400,"INVALID_OFFSET");
    const offset=Number(rawOffset);
    const rows=await getDb().growthPractice.findMany({
      where:{userId:principal.userId},
      orderBy:[{createdAt:"desc"},{id:"desc"}],
      skip:offset,take:pageSize+1,select:growthPracticeSelect
    });
    return NextResponse.json({
      practices:rows.slice(0,pageSize),
      nextOffset:rows.length>pageSize?offset+pageSize:null
    },{headers});
  }catch(error){return errorResponse(error);}
}

export async function POST(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB")requireSameOrigin(request);
    const input=await boundedJson(request,createGrowthPractice,12_000);
    await enforceRateLimit("growth-practice-create",principal.userId,30,60*60*1000);
    const db=getDb();
    const created=await db.growthPractice.createMany({
      data:{...input,userId:principal.userId},skipDuplicates:true
    });
    const practice=await db.growthPractice.findUniqueOrThrow({
      where:{userId_requestId:{userId:principal.userId,requestId:input.requestId}},
      select:growthPracticeSelect
    });
    if(created.count===0&&(practice.dimension!==input.dimension||practice.title!==input.title||
        practice.question!==input.question||practice.nextAction!==input.nextAction||
        practice.successCriteria!==input.successCriteria)){
      throw new ApiError(409,"GROWTH_PRACTICE_REQUEST_REUSED");
    }
    return NextResponse.json({practice},{status:created.count===1?201:200,headers});
  }catch(error){return errorResponse(error);}
}
