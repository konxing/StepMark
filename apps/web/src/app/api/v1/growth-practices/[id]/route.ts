import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/server/db";
import {growthPracticeId,growthPracticeSelect,updateGrowthPractice} from "@/server/growth-practice";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";

export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const headers={"Cache-Control":"private, no-store"};

async function ownPracticeScope(request:NextRequest,context:Context){
  const principal=await principalFromRequest(request);
  if(principal.kind==="WEB")requireSameOrigin(request);
  const id=growthPracticeId.safeParse((await context.params).id);
  if(!id.success)throw new ApiError(404,"GROWTH_PRACTICE_NOT_FOUND");
  return {id:id.data,userId:principal.userId};
}

export async function PUT(request:NextRequest,context:Context){
  try{
    const scope=await ownPracticeScope(request,context);
    const {revision,complete,...fields}=await boundedJson(request,updateGrowthPractice,32_000);
    await enforceRateLimit("growth-practice-update",scope.userId,100,60*60*1000);
    const db=getDb();
    const [practice]=await db.growthPractice.updateManyAndReturn({
      where:{...scope,revision,completedAt:null},
      data:{...fields,revision:{increment:1},completedAt:complete?new Date():null},
      select:growthPracticeSelect
    });
    if(!practice){
      const exists=await db.growthPractice.findFirst({where:scope,select:{id:true}});
      if(!exists)throw new ApiError(404,"GROWTH_PRACTICE_NOT_FOUND");
      throw new ApiError(409,"GROWTH_PRACTICE_CHANGED");
    }
    return NextResponse.json({practice},{headers});
  }catch(error){return errorResponse(error);}
}

export async function DELETE(request:NextRequest,context:Context){
  try{
    const scope=await ownPracticeScope(request,context);
    await enforceRateLimit("growth-practice-delete",scope.userId,30,60*60*1000);
    const result=await getDb().growthPractice.deleteMany({where:scope});
    if(result.count===0)throw new ApiError(404,"GROWTH_PRACTICE_NOT_FOUND");
    return NextResponse.json({ok:true},{headers});
  }catch(error){return errorResponse(error);}
}
