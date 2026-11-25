import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {hashPassword,issueSession,SESSION_COOKIE} from "../src/server/security";
import {taskContentDigest} from "../src/server/assessment-integrity";
import {GET,PUT} from "../src/app/api/v1/habits/[id]/training/route";

test("linked practice lists only the completed opportunities between the person's independently scored forms",async()=>{
  const db=getDb();
  const passwordHash=await hashPassword("habit-training-fixture-password");
  const createAccount=()=>db.user.create({data:{credential:{create:{
    email:"training_"+randomUUID()+"@example.test",passwordHash,verifiedAt:new Date()
  }}}});
  const [owner,outsider]=await Promise.all([createAccount(),createAccount()]);
  try{
    const habit=await db.habit.create({data:{userId:owner.id,title:"核对推理依据",action:"找一条反证"}});
    const ownerToken=(await issueSession(owner.id,"WEB")).token;
    const otherToken=(await issueSession(outsider.id,"WEB")).token;
    const context={params:Promise.resolve({id:habit.id})};
    const origin=process.env.APP_ORIGIN??"http://localhost:3000";
    const path=`${origin}/api/v1/habits/${habit.id}/training`;
    const req=(token:string,target?:"reasoning.logic"|null)=>new NextRequest(path, {
      method:target===undefined?"GET":"PUT",
      headers:{cookie:SESSION_COOKIE+"="+token,origin,"Content-Type":"application/json"},
      ...(target===undefined?{}:{body:JSON.stringify({target})})
    });
    assert.deepEqual(await (await GET(req(ownerToken),context)).json(),{target:null});
    assert.equal((await PUT(req(otherToken,"reasoning.logic"),context)).status,404);
    assert.equal((await PUT(req(ownerToken,"reasoning.logic"),context)).status,200);
    const current=Date.now(),day=86400000;
    const before=(days:number)=>new Date(current-days*day);
    await db.habitAssociation.update({
      where:{habitId_constructCode:{habitId:habit.id,constructCode:"reasoning.logic"}},
      data:{updatedAt:before(11)}
    });
    assert.equal((await PUT(req(ownerToken,"reasoning.logic"),context)).status,200);
    assert.equal((await db.habitAssociation.findFirstOrThrow({where:{habitId:habit.id}})).updatedAt.getTime(),before(11).getTime());
    const tasks=await db.task.findMany({
      where:{formCode:{in:["logic-a-v1","logic-b-v1"]}},
      orderBy:{formOrder:"asc"},select:{id:true,version:true,formOrder:true,formCode:true,content:true}
    });
    assert.equal(tasks.length,12);
    await db.assessmentAttempt.createMany({data:tasks.map(task=>{
      const initial=task.formCode==="logic-a-v1";
      return {userId:owner.id,taskId:task.id,taskVersion:task.version,evidenceKind:"OBJECTIVE",
        rawScore:task.formOrder!<=(initial?3:5)?100:0,createdAt:before(initial?12:2),
        evidence:{taskContentSha256:taskContentDigest(task.content)}};
    })});
    await db.habitEvent.createMany({data:[
      {opportunityKey:"before-link",occurredAt:before(11.5),eligible:true,completed:true},
      {opportunityKey:"practice",occurredAt:before(6),eligible:true,completed:true},
      {opportunityKey:"missed",occurredAt:before(5),eligible:true,completed:false},
      {opportunityKey:"no-cue",occurredAt:before(4),eligible:false,completed:false},
      {opportunityKey:"after-retest",occurredAt:before(1),eligible:true,completed:true}
    ].map(event=>({...event,habitId:habit.id,source:"test"}))});
    const response=await GET(req(ownerToken),context);
    assert.equal(response.status,200);
    const report=await response.json();
    assert.equal(report.baseline.correct,3);
    assert.equal(report.retest.correct,5);
    assert.equal(report.recordedTrainingBetweenTests,1);
    assert.equal(report.rawDifferencePoints,33);
    assert.equal(report.theta,undefined);
    assert.equal(report.retest.reviews,undefined);
    assert.equal((await GET(req(otherToken),context)).status,404);
    await db.habitAssociation.updateMany({where:{habitId:habit.id},data:{updatedAt:before(1)}});
    const lateLink=await (await GET(req(ownerToken),context)).json();
    assert.equal(lateLink.retest.correct,5);
    assert.equal(lateLink.recordedTrainingBetweenTests,null);
    assert.equal(lateLink.rawDifferencePoints,null);
    assert.equal((await PUT(req(ownerToken,null),context)).status,200);
    assert.equal(await db.assessmentAttempt.count({where:{userId:owner.id}}),12);
  }finally{
    await db.user.deleteMany({where:{id:{in:[owner.id,outsider.id]}}});
  }
});
