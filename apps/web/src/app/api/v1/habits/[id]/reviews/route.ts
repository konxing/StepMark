import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {boundedJson,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
const input=z.object({enabled:z.boolean()}).strict();
export async function PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}){
  try {
    const p=await principalFromRequest(request);
    if(p.kind==="WEB")requireSameOrigin(request);
    const {id}=await ctx.params;
    if(!z.uuid().safeParse(id).success) {
      return NextResponse.json({error:{code:"NOT_FOUND"}},{status:404,headers:{"Cache-Control":"no-store"}});
    }
    const body=await boundedJson(request,input);
    const result=await getDb().habit.updateMany({
      where:{id,userId:p.userId,archivedAt:null},data:{reviewEnabled:body.enabled}
    });
    return NextResponse.json(result.count?{ok:true,reviewEnabled:body.enabled}:{error:{code:"NOT_FOUND"}},
      {status:result.count?200:404,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
