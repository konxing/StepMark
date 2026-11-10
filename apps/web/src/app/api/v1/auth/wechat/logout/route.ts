import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/server/db";
import {ApiError,errorResponse,hashToken,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
export async function POST(request:NextRequest) {
  try{
    const authorization=request.headers.get("authorization");
    if(!authorization?.startsWith("Bearer ")) throw new ApiError(401,"UNAUTHENTICATED");
    const p=await principalFromRequest(request);
    if(p.kind!=="WECHAT") throw new ApiError(401,"UNAUTHENTICATED");
    await getDb().session.updateMany({where:{
      userId:p.userId,kind:"WECHAT",tokenHash:hashToken(authorization.slice(7)),revokedAt:null
    },data:{revokedAt:new Date()}});
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
