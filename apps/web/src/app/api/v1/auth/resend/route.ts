import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,hashToken,newSecret,normalizedEmail,requireSameOrigin,sourceKey} from "@/server/security";
import {emailAvailable,sendVerification} from "@/server/email";
export const runtime="nodejs";
const input=z.object({email:z.email().max(254)}).strict();
export async function POST(request:NextRequest){
  try{
    requireSameOrigin(request);
    if(!emailAvailable())throw new ApiError(503,"EMAIL_NOT_CONFIGURED");
    const {email:raw}=await boundedJson(request,input);
    const email=normalizedEmail(raw);
    await enforceRateLimit("resend-ip",sourceKey(request),7,60*60*1000);
    await enforceRateLimit("resend-email",email,3,24*60*60*1000);
    const db=getDb();
    const account=await db.credential.findUnique({
      where:{email},select:{id:true,verifiedAt:true}
    });
    if(account&&!account.verifiedAt){
      const token=newSecret();
      await db.verificationToken.create({data:{credentialId:account.id,purpose:"VERIFY",
        tokenHash:hashToken(token),expiresAt:new Date(Date.now()+24*60*60*1000)}});
      try {await sendVerification(email,token);}catch{/* Public result never reveals whether account exists. */}
    }
    return NextResponse.json({message:"If eligible, an email will be sent."},{status:202,headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
