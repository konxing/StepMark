import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {singleChoiceContentSchema} from "@stepmark/contracts";
import {getDb} from "@/server/db";
import {ApiError,errorResponse,principalFromRequest} from "@/server/security";
export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{
    const p=await principalFromRequest(request);
    const construct=new URL(request.url).searchParams.get("construct");
    if(!construct || !z.string().regex(/^[a-z][a-z0-9_.-]{2,63}$/).safeParse(construct).success)
      throw new ApiError(400,"INVALID_CONSTRUCT");
    const db=getDb();
    const forms=await db.task.findMany({where:{constructCode:construct,publishedAt:{lte:new Date()}},
      orderBy:{id:"asc"},take:20,
      select:{id:true,version:true,content:true}});
    const completed=await db.assessmentAttempt.findMany({where:{userId:p.userId,taskId:{in:forms.map(f=>f.id)}},
      select:{taskId:true}});
    const done=new Set(completed.map(x=>x.taskId));
    // Explicit whitelist: NEVER leak correctKey, answer explanations, or calibration secrets.
    const tasks=forms.filter(f=>!done.has(f.id)).flatMap(f=>{
      const parsed=singleChoiceContentSchema.safeParse(f.content);
      if(!parsed.success)return [];
      return [{id:f.id,version:f.version,kind:parsed.data.kind,
        prompt:parsed.data.prompt,options:parsed.data.options}];
    });
    return NextResponse.json({construct,tasks,notice:"Original demonstration items; no normative ability estimate."},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
