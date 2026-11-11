import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { boundedJson, DUMMY_PASSWORD_HASH, enforceRateLimit, errorResponse, issueSession, normalizedEmail, requireSameOrigin, setWebCookie, sourceKey, verifyPassword } from "@/server/security";

export const runtime="nodejs";
const login = z.object({email:z.email().max(254),password:z.string().min(1).max(128)}).strict();
export async function POST(request:NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await boundedJson(request,login);
    const email = normalizedEmail(body.email);
    await enforceRateLimit("login-ip",sourceKey(request),30,15*60*1000);
    await enforceRateLimit("login-email",email,8,15*60*1000);
    const credential = await getDb().credential.findUnique({
      where:{email},select:{userId:true,passwordHash:true,verifiedAt:true,user:{select:{deletedAt:true}}}
    });
    const valid = await verifyPassword(body.password,credential?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!credential || !valid || !credential.verifiedAt || credential.user.deletedAt) {
      return NextResponse.json({error:{code:"INVALID_CREDENTIALS_OR_UNVERIFIED"}},{status:401,headers:{"Cache-Control":"no-store"}});
    }
    const {token}=await issueSession(credential.userId,"WEB");
    const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    setWebCookie(response,token);
    return response;
  }catch(error){return errorResponse(error);}
}
