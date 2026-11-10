import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {adherencePosterior,wilsonInterval} from "@stepmark/core";
import {getDb} from "@/server/db";
import {findOwnHabit} from "@/server/habit-service";
import {ApiError,errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
/**
 * Index-friendly aggregate queries. Do not fetch full user behavior logs to
 * compute a couple of counts. No write side effects, no AI provider latency.
 */
export async function GET(request:NextRequest,ctx:{params:Promise<{id:string}>}){
  try {
    const p=await principalFromRequest(request);
    const {id}=await ctx.params;
    if(!z.uuid().safeParse(id).success)throw new ApiError(404,"NOT_FOUND");
    const habit=await findOwnHabit(p.userId,id);
    if(!habit)throw new ApiError(404,"NOT_FOUND");
    const db=getDb();
    const [eligibleOpportunities,completions,checks]=await Promise.all([
      db.habitEvent.count({where:{habitId:id,eligible:true}}),
      db.habitEvent.count({where:{habitId:id,eligible:true,completed:true}}),
      db.automaticityCheck.findMany({where:{habitId:id},
        orderBy:{measuredAt:"desc"},take:1,
        select:{indexScore:true,measuredAt:true}})
    ]);
    const posterior=adherencePosterior(completions,eligibleOpportunities);
    const interval=wilsonInterval(completions,eligibleOpportunities);
    return NextResponse.json({
      habitId:id,eligibleOpportunities,completions,
      observedRate:eligibleOpportunities?completions/eligibleOpportunities:null,
      wilsonInterval95:interval, posterior,
      latestAutomaticity:checks[0]??null,
      modelVersions:{adherence:"beta-binomial-v1",interval:"wilson-v1"},
      caveat:"Observed task completion is not habit automaticity or ability. Repeated opportunities may be dependent."
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
