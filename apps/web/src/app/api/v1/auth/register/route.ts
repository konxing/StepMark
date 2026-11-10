import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { emailAvailable, sendVerification } from "@/server/email";
import { ApiError, boundedJson, enforceRateLimit, errorResponse, hashPassword, hashToken, newSecret, normalizedEmail, requireSameOrigin, sourceKey } from "@/server/security";

export const runtime = "nodejs";
const registration = z.object({
  email:z.email().max(254),
  password:z.string().min(12).max(128)
}).strict();

export async function POST(request:NextRequest) {
  try {
    requireSameOrigin(request);
    if (!emailAvailable()) throw new ApiError(503,"EMAIL_NOT_CONFIGURED");
    const body = await boundedJson(request,registration);
    const email = normalizedEmail(body.email);
    await enforceRateLimit("register-ip",sourceKey(request),5,60*60*1000);
    await enforceRateLimit("register-email",email,3,24*60*60*1000);
    const db = getDb();
    const existing = await db.credential.findUnique({where:{email},select:{id:true}});
    if (!existing) {
      const passwordHash = await hashPassword(body.password);
      const token = newSecret();
      try {
        await db.user.create({data:{credential:{create:{
          email,passwordHash,verifications:{create:{
            tokenHash:hashToken(token),
            expiresAt:new Date(Date.now()+24*60*60*1000)
          }}
        }}}});
        await sendVerification(email,token);
      } catch (error) {
        // Duplicate email may be a concurrent request: do not disclose.
        if (error instanceof ApiError) throw error;
        const duplicate = await db.credential.findUnique({where:{email},select:{id:true}});
        if (!duplicate) throw error;
      }
    }
    return NextResponse.json({message:"If registration is eligible, a verification email will be sent."},
      {status:202,headers:{"Cache-Control":"no-store"}});
  } catch(error) {return errorResponse(error);}
}
