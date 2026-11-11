import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {observationCorrectionSchema} from "@stepmark/contracts";
import {getDb} from "@/server/db";
import {ApiError,boundedJson,enforceRateLimit,errorResponse,principalFromRequest,requireSameOrigin} from "@/server/security";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};

/**
 * Correct a previously recorded opportunity without destroying its history.
 * A single revision is a compare-and-swap transaction, so concurrent clients
 * cannot silently overwrite one another's updates.
 */
export async function PUT(request:NextRequest,ctx:Context){
  try{
    const principal=await principalFromRequest(request);
    if(principal.kind==="WEB")requireSameOrigin(request);
    const {id}=await ctx.params;
    if(!z.uuid().safeParse(id).success)throw new ApiError(404,"NOT_FOUND");
    const input=await boundedJson(request,observationCorrectionSchema);
    await enforceRateLimit("opportunity-correction",principal.userId,30,60*60*1000);
    const db=getDb();
    const previous=await db.habitEvent.findFirst({
      where:{id,habit:{userId:principal.userId,archivedAt:null}},
      select:{id:true,habitId:true,opportunityKey:true,eligible:true,completed:true,
        occurredAt:true,revision:true,reflection:{select:{id:true}}}
    });
    if(!previous)throw new ApiError(404,"NOT_FOUND");
    if(previous.revision!==input.expectedRevision)throw new ApiError(409,"STALE_OPPORTUNITY_REVISION");
    if(previous.eligible===input.eligible && previous.completed===input.completed){
      return NextResponse.json({event:previous,unchanged:true},{headers:{"Cache-Control":"no-store"}});
    }
    // Do not invalidate a diary or in-flight vendor consent without explicit user action.
    if(previous.reflection && !input.completed)
      throw new ApiError(409,"DELETE_LINKED_REFLECTION_FIRST");
    const event=await db.$transaction(async tx=>{
      const updated=await tx.habitEvent.updateMany({
        where:{id,revision:input.expectedRevision,habit:{userId:principal.userId,archivedAt:null},
          ...(input.completed?{}:{reflection:{is:null}})},
        data:{eligible:input.eligible,completed:input.completed,revision:{increment:1}}
      });
      if(updated.count!==1)throw new ApiError(409,"STALE_OPPORTUNITY_REVISION");
      await tx.habitEventCorrection.create({data:{
        eventId:id,revision:input.expectedRevision+1,
        previousEligible:previous.eligible,previousCompleted:previous.completed,
        updatedEligible:input.eligible,updatedCompleted:input.completed,
        source:principal.kind==="WEB"?"web":"wechat"
      }});
      return tx.habitEvent.findUniqueOrThrow({where:{id},
        select:{id:true,habitId:true,opportunityKey:true,eligible:true,completed:true,
          occurredAt:true,revision:true}});
    });
    return NextResponse.json({event,unchanged:false},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
