import { NextRequest,NextResponse } from "next/server";
import { errorResponse, principalFromRequest } from "@/server/security";
export const runtime = "nodejs";
export async function GET(request:NextRequest) {
  try{
    const p=await principalFromRequest(request);
    return NextResponse.json({user:{id:p.userId,email:p.email,kind:p.kind}},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
