import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { clearWebCookie,errorResponse,hashToken,requireSameOrigin,SESSION_COOKIE } from "@/server/security";

export const runtime = "nodejs";
export async function POST(request:NextRequest) {
  try {
    requireSameOrigin(request);
    const token=request.cookies.get(SESSION_COOKIE)?.value;
    if(token && token.length>=32 && token.length<=128) {
      await getDb().session.updateMany({
        where:{tokenHash:hashToken(token),kind:"WEB",revokedAt:null},
        data:{revokedAt:new Date()}
      });
    }
    const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    clearWebCookie(response);
    return response;
  }catch(error){return errorResponse(error);}
}
