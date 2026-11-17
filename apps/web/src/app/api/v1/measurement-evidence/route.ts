import {NextRequest,NextResponse} from "next/server";
import {getLogicFormOverview} from "@/server/assessment-forms";
import {errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
/** No item payloads, reviewer data or uncalibrated latent scores. */
export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    const overview=await getLogicFormOverview(principal.userId);
    return NextResponse.json(overview.measurementEvidence,{
      headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
    });
  }catch(error){return errorResponse(error);}
}
