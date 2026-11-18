import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {desktopCodeHash,DESKTOP_TOKEN_PREFIX,verifyDesktopCode} from "@/server/desktop-auth";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,hashToken,newSecret,sourceKey} from "@/server/security";

export const runtime="nodejs";
const input=z.object({
  code:z.string().min(20).max(2048),
  codeVerifier:z.string().min(43).max(128),
  redirectUri:z.string().min(20).max(120)
}).strict();
export async function POST(request:NextRequest){
  try{
    const {code,codeVerifier,redirectUri}=await boundedJson(request,input,4096);
    await enforceRateLimit("desktop-exchange",sourceKey(request),40,15*60*1000);
    const nonce=verifyDesktopCode(code,codeVerifier,redirectUri);
    const now=new Date();
    const result=await getDb().$transaction(async tx=>{
      const authorization=await tx.session.findUnique({
        where:{tokenHash:desktopCodeHash(nonce)},
        select:{id:true,userId:true,expiresAt:true,revokedAt:true,kind:true,
          user:{select:{deletedAt:true,credential:{select:{verifiedAt:true}}}}}
      });
      if(!authorization || authorization.kind!=="WEB" ||
         authorization.revokedAt || authorization.expiresAt<=now ||
         authorization.user.deletedAt || !authorization.user.credential?.verifiedAt) {
        throw new ApiError(400,"INVALID_OR_EXPIRED_DESKTOP_CODE");
      }
      const claimed=await tx.session.updateMany({
        where:{id:authorization.id,revokedAt:null,expiresAt:{gt:now}},
        data:{revokedAt:now}
      });
      if(claimed.count!==1)throw new ApiError(400,"INVALID_OR_EXPIRED_DESKTOP_CODE");
      const accessToken=DESKTOP_TOKEN_PREFIX+newSecret();
      const expiresAt=new Date(now.getTime()+14*24*60*60*1000);
      await tx.session.create({data:{
        userId:authorization.userId,kind:"WEB",tokenHash:hashToken(accessToken),expiresAt
      }});
      return {accessToken,expiresAt:expiresAt.toISOString(),tokenType:"Bearer" as const};
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return errorResponse(error);}
}
