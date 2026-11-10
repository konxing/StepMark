import {PrismaClient} from "../src/generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {judgeHabitNote} from "../src/server/habit-ai";

/**
 * Server-only bounded worker. Run from scheduler separately from HTTP requests.
 * Each invocation claims <=10 consented notes. Do not log raw text.
 * Tool-using agents and model-driven database writes are intentionally absent.
 */
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL required");
if(!process.env.AI_HABIT_API_KEY || !process.env.AI_HABIT_MODEL)throw new Error("AI provider missing");
const db=new PrismaClient({adapter:new PrismaPg({connectionString,max:2,connectionTimeoutMillis:3000})});
async function main(){
  // Recover interrupted worker claims, keeping a strictly bounded external-call lease.
  await db.habitReflection.updateMany({where:{aiStatus:"PROCESSING",aiConsent:true,
    reviewedAt:{lt:new Date(Date.now()-20*60*1000)}},data:{aiStatus:"PENDING"}});
  const pending=await db.habitReflection.findMany({
    where:{aiStatus:"PENDING",aiConsent:true,note:{not:null},habit:{user:{deletedAt:null}}},
    orderBy:{createdAt:"asc"},take:10,
    select:{id:true,note:true}
  });
  let completed=0,failed=0;
  for(const row of pending){
    const claimed=await db.habitReflection.updateMany({
      where:{id:row.id,aiStatus:"PENDING",aiConsent:true},
      data:{aiStatus:"PROCESSING",reviewedAt:new Date()}
    });
    if(claimed.count!==1 || !row.note)continue;
    try{
      const result=await judgeHabitNote(row.note);
      await db.habitReflection.updateMany({where:{id:row.id,aiStatus:"PROCESSING",aiConsent:true},
        data:{aiStatus:"COMPLETED",aiLevel:result.level,aiConfidence:result.confidence,
          aiQuote:result.quote,aiModelId:result.modelId,
          aiPromptVersion:result.promptVersion,reviewedAt:new Date()}});
      completed++;
    }catch{
      await db.habitReflection.updateMany({where:{id:row.id,aiStatus:"PROCESSING"},
        data:{aiStatus:"FAILED",reviewedAt:new Date()}});
      failed++;
    }
  }
  process.stdout.write(JSON.stringify({processed:completed+failed,completed,failed})+"\n");
}
main().catch(()=>{process.stderr.write("Habit note worker failed\n");process.exitCode=1;})
  .finally(()=>db.$disconnect());
