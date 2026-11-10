import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {listOwnHabits} from "@/server/habit-service";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
const create=z.object({
  title:z.string().trim().min(2).max(180),
  action:z.string().trim().min(2).max(500),
  cue:z.string().trim().max(250).optional()
}).strict();
export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    const habits=await listOwnHabits(principal.userId);
    return NextResponse.json({habits},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB") requireSameOrigin(request);
    const input=await boundedJson(request,create);
    await enforceRateLimit("habit-create",principal.userId,20,60*60*1000);
    const count=await getDb().habit.count({where:{userId:principal.userId,archivedAt:null}});
    if(count>=100)throw new ApiError(409,"HABIT_QUOTA_EXCEEDED");
    const habit=await getDb().habit.create({
      data:{userId:principal.userId,...input},
      select:{id:true,title:true,cue:true,action:true,createdAt:true}
    });
    return NextResponse.json({habit},{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
