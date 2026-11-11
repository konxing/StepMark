import {NextRequest,NextResponse} from "next/server";
import {listDueHabitReviews} from "@/server/due-reviews";
import {errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const principal=await principalFromRequest(request);
    return NextResponse.json(await listDueHabitReviews(principal.userId),
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
