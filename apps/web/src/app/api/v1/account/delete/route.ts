import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,clearWebCookie,enforceRateLimit,errorResponse,
  principalFromRequest,requireSameOrigin,verifyPassword} from "@/server/security";
export const runtime="nodejs";
const input=z.object({password:z.string().min(1).max(128),confirmation:z.literal("DELETE")}).strict();
export async function POST(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    if(p.kind!=="WEB")throw new ApiError(403,"WEB_REAUTH_REQUIRED");
    requireSameOrigin(request);
    const {password}=await boundedJson(request,input);
    await enforceRateLimit("account-delete-user",p.userId,3,60*60*1000);
    const db=getDb();
    const account=await db.credential.findUnique({where:{userId:p.userId},
      select:{passwordHash:true}});
    if(!account||!(await verifyPassword(password,account.passwordHash)))throw new ApiError(403,"REAUTH_FAILED");
    await db.$transaction(async tx=>{
      // Remove audit details first instead of leaving per-user orphan information.
      await tx.auditLog.deleteMany({where:{userId:p.userId}});
      // FKs cascade owned sessions, assessments, habits and identities.
      await tx.user.delete({where:{id:p.userId}});
    });
    const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    clearWebCookie(response);
    return response;
  }catch(error){return errorResponse(error);}
}
