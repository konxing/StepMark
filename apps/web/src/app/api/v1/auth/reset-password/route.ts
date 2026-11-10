import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,hashPassword,hashToken,requireSameOrigin,sourceKey} from "@/server/security";
export const runtime="nodejs";
const input=z.object({token:z.string().min(32).max(128),newPassword:z.string().min(12).max(128)}).strict();
export async function POST(request:NextRequest){
  try{
    requireSameOrigin(request);
    const body=await boundedJson(request,input);
    await enforceRateLimit("reset-ip",sourceKey(request),15,60*60*1000);
    const db=getDb(),now=new Date();
    const verification=await db.verificationToken.findUnique({where:{tokenHash:hashToken(body.token)},
      select:{id:true,purpose:true,expiresAt:true,consumedAt:true,credential:{select:{id:true,userId:true}}}});
    if(!verification||verification.purpose!=="RESET"||verification.consumedAt||verification.expiresAt<=now)
      throw new ApiError(400,"INVALID_OR_EXPIRED_TOKEN");
    const passwordHash=await hashPassword(body.newPassword);
    await db.$transaction(async(tx)=>{
      const used=await tx.verificationToken.updateMany({where:{id:verification.id,purpose:"RESET",consumedAt:null,expiresAt:{gt:now}},data:{consumedAt:now}});
      if(used.count!==1)throw new ApiError(400,"INVALID_OR_EXPIRED_TOKEN");
      await tx.credential.update({where:{id:verification.credential.id},data:{passwordHash}});
      await tx.session.updateMany({where:{userId:verification.credential.userId,revokedAt:null},data:{revokedAt:now}});
    });
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
