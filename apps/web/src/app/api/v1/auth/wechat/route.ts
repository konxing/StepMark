import { NextRequest, NextResponse } from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,hashToken,issueSession,sourceKey} from "@/server/security";

export const runtime="nodejs";
const bodySchema=z.object({code:z.string().min(6).max(255)}).strict();
const wxResponse=z.object({openid:z.string().min(1).max(255),session_key:z.string().min(1),unionid:z.string().optional()}).passthrough();
export async function POST(request:NextRequest) {
  try {
    const {code}=await boundedJson(request,bodySchema,1024);
    const appid=process.env.WECHAT_APP_ID,secret=process.env.WECHAT_APP_SECRET;
    if(!appid || !secret) throw new ApiError(503,"WECHAT_NOT_CONFIGURED");
    await enforceRateLimit("wechat-ip",sourceKey(request),15,15*60*1000);
    await enforceRateLimit("wechat-code",hashToken(code),2,15*60*1000);
    // A single-use server-side replay guard; do not store raw wx.login codes.
    try {await getDb().loginCode.create({data:{codeHash:hashToken(code),expiresAt:new Date(Date.now()+10*60*1000)}});}
    catch{throw new ApiError(409,"CODE_ALREADY_USED");}
    const url=new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid",appid);
    url.searchParams.set("secret",secret);
    url.searchParams.set("js_code",code);
    url.searchParams.set("grant_type","authorization_code");
    const response=await fetch(url,{method:"GET",cache:"no-store",signal:AbortSignal.timeout(5500)});
    if(!response.ok) throw new ApiError(502,"WECHAT_UPSTREAM_ERROR");
    const json:unknown=await response.json();
    const parsed=wxResponse.safeParse(json);
    if(!parsed.success) throw new ApiError(401,"WECHAT_CODE_INVALID");
    const openid=parsed.data.openid;
    const db=getDb();
    let identity=await db.externalIdentity.findUnique({
      where:{provider_providerSubject:{provider:"WECHAT",providerSubject:openid}},
      select:{userId:true,user:{select:{deletedAt:true}}}
    });
    if(!identity){
      try{
        const user=await db.user.create({
          data:{identities:{create:{provider:"WECHAT",providerSubject:openid}}},
          select:{id:true}
        });
        identity={userId:user.id,user:{deletedAt:null}};
      }catch{
        // Concurrent requests for the same provider subject must still map
        // to one canonical user, never to separate account copies.
        identity=await db.externalIdentity.findUnique({
          where:{provider_providerSubject:{provider:"WECHAT",providerSubject:openid}},
          select:{userId:true,user:{select:{deletedAt:true}}}
        });
      }
    }
    if(!identity || identity.user.deletedAt) throw new ApiError(401,"ACCOUNT_UNAVAILABLE");
    const session=await issueSession(identity.userId,"WECHAT");
    return NextResponse.json({accessToken:session.token,tokenType:"Bearer",
      expiresAt:session.expiresAt.toISOString()},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
