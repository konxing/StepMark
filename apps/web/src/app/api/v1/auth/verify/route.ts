import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { ApiError, boundedJson, enforceRateLimit, errorResponse, hashToken, requireSameOrigin, sourceKey } from "@/server/security";

export const runtime = "nodejs";
const verifyInput = z.object({token:z.string().min(32).max(128)}).strict();
export async function POST(request:NextRequest) {
  try {
    requireSameOrigin(request);
    const {token} = await boundedJson(request,verifyInput);
    await enforceRateLimit("verify-ip",sourceKey(request),20,60*60*1000);
    const db = getDb(), now = new Date(), hashed = hashToken(token);
    const verification = await db.verificationToken.findUnique({
      where:{tokenHash:hashed}, select:{id:true,credentialId:true,purpose:true,expiresAt:true,consumedAt:true}
    });
    if (!verification || verification.purpose!=="VERIFY" || verification.consumedAt || verification.expiresAt <= now) {
      throw new ApiError(400,"INVALID_OR_EXPIRED_TOKEN");
    }
    await db.$transaction(async(tx)=>{
      const updated=await tx.verificationToken.updateMany({
        where:{id:verification.id,consumedAt:null,expiresAt:{gt:now}},
        data:{consumedAt:now}
      });
      if(updated.count!==1) throw new ApiError(400,"INVALID_OR_EXPIRED_TOKEN");
      await tx.credential.update({where:{id:verification.credentialId},data:{verifiedAt:now}});
    });
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
