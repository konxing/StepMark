import {getDb} from "@/server/db";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {listOwnHabits} from "@/server/habit-service";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
import {assistantProviderConfig,proposeAssistantCommand} from "@/server/assistant-provider";
import {authorizeAssistantCommand,validateClientLocalDate,assistantMessageDigest} from "@/server/assistant-command";
import {executeAssistantCommand} from "@/server/assistant-execute";
export const runtime="nodejs";
const requestSchema=z.object({
  message:z.string().trim().min(2).max(600),
  requestId:z.uuid(),
  localDate:z.iso.date(),
  consentToAI:z.literal(true)
}).strict();
export async function POST(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB")requireSameOrigin(request);
    const body=await boundedJson(request,requestSchema,4096);
    try{validateClientLocalDate(body.localDate);}catch{throw new ApiError(400,"INVALID_LOCAL_DATE");}
    // Return an identical completed request without paying for a second model call.
    const digest=assistantMessageDigest(body.message);
    const earlier=await getDb().assistantAction.findUnique({
      where:{userId_requestId:{userId:principal.userId,requestId:body.requestId}},
      select:{messageDigest:true,result:true}
    });
    if(earlier){
      if(earlier.messageDigest!==digest)throw new ApiError(409,"ASSISTANT_REQUEST_ID_REUSED");
      return NextResponse.json(earlier.result,{headers:{"Cache-Control":"private, no-store"}});
    }
    // Fail safely BEFORE using any external provider when consent or server
    // configuration is missing. No raw user text is logged.
    try{assistantProviderConfig();}catch{throw new ApiError(503,"ASSISTANT_NOT_CONFIGURED");}
    await enforceRateLimit("assistant-chat",principal.userId,30,60*60*1000);
    const habits=await listOwnHabits(principal.userId);
    let result;
    try{
      const proposal=await proposeAssistantCommand(body.message,habits);
      const allowed=authorizeAssistantCommand(proposal.plan,body.message,habits);
      result=await executeAssistantCommand({userId:principal.userId,
        requestId:body.requestId,localDate:body.localDate,message:body.message,
        command:allowed,model:proposal.model});
    }catch(error){
      if(error instanceof ApiError)throw error;
      throw new ApiError(502,"ASSISTANT_UNAVAILABLE");
    }
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
