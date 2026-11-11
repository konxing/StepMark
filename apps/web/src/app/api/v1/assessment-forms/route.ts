import {NextRequest,NextResponse} from "next/server";
import {getLogicFormOverview} from "@/server/assessment-forms";
import {errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    const result=await getLogicFormOverview(principal.userId);
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
