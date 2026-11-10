import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
export async function DELETE(request:NextRequest,context:{params:Promise<{id:string}>}){
  try {
    const p=await principalFromRequest(request);
    if(p.kind==="WEB")requireSameOrigin(request);
    const {id}=await context.params;
    if(!z.uuid().safeParse(id).success){
      return NextResponse.json({error:{code:"NOT_FOUND"}},{status:404,headers:{"Cache-Control":"no-store"}});
    }
    const result=await getDb().habit.updateMany({
      where:{id,userId:p.userId,archivedAt:null},data:{archivedAt:new Date()}
    });
    return NextResponse.json(result.count?{ok:true}:{error:{code:"NOT_FOUND"}},{
      status:result.count?200:404,headers:{"Cache-Control":"no-store"}
    });
  }catch(error){return errorResponse(error);}
}
