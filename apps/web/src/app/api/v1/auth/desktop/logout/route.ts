import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/server/db";
import {DESKTOP_TOKEN_PREFIX} from "@/server/desktop-auth";
import {ApiError,errorResponse,hashToken,lookupSession} from "@/server/security";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  try{
    const authorization=request.headers.get("authorization")??"";
    if(!authorization.startsWith("Bearer "+DESKTOP_TOKEN_PREFIX))
      throw new ApiError(401,"UNAUTHENTICATED");
    const token=authorization.slice(7);
    const p=await lookupSession(token,"WEB",true);
    if(!p)throw new ApiError(401,"UNAUTHENTICATED");
    await getDb().session.updateMany({
      where:{userId:p.userId,kind:"WEB",tokenHash:hashToken(token),revokedAt:null},
      data:{revokedAt:new Date()}
    });
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
