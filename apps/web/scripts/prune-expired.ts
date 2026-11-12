import {PrismaClient} from "../src/generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
/** Run daily through a trusted server-side scheduler, not a public HTTP endpoint. */
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL is required");
const db=new PrismaClient({adapter:new PrismaPg({connectionString,max:2,connectionTimeoutMillis:3000})});
const now=new Date(),weekAgo=new Date(Date.now()-7*24*60*60*1000),
  chatReceiptCutoff=new Date(Date.now()-30*24*60*60*1000);
async function main(){
  const [buckets,codes,tokens,sessions,assistantActions]=await db.$transaction([
    db.rateLimitBucket.deleteMany({where:{expiresAt:{lt:now}}}),
    db.loginCode.deleteMany({where:{expiresAt:{lt:now}}}),
    db.verificationToken.deleteMany({where:{expiresAt:{lt:weekAgo}}}),
    db.session.deleteMany({where:{OR:[{expiresAt:{lt:weekAgo}},{revokedAt:{lt:weekAgo}}]}}),
    db.assistantAction.deleteMany({where:{createdAt:{lt:chatReceiptCutoff}}})
  ]);
  process.stdout.write(JSON.stringify({rateLimitBuckets:buckets.count,
    loginCodes:codes.count,expiredTokens:tokens.count,oldSessions:sessions.count,
    expiredAssistantReceipts:assistantActions.count})+"\n");
}
main().finally(()=>db.$disconnect()).catch(()=>{process.stderr.write("Prune failed\n");process.exitCode=1;});
