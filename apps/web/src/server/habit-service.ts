import {getDb} from "./db";

export async function listOwnHabits(userId:string) {
  // One indexed query. No N+1 event fetches, no cross-user joins.
  return getDb().habit.findMany({
    where:{userId,archivedAt:null},
    orderBy:[{createdAt:"desc"},{id:"desc"}],
    take:50,
    select:{id:true,title:true,cue:true,action:true,reviewEnabled:true,createdAt:true,
      _count:{select:{events:true,checks:true}}}
  });
}
export async function findOwnHabit(userId:string,habitId:string) {
  return getDb().habit.findFirst({
    where:{id:habitId,userId,archivedAt:null},select:{id:true}
  });
}
export async function listOwnEvents(userId:string,habitId:string) {
  const own=await findOwnHabit(userId,habitId);
  if(!own)return null;
  return getDb().habitEvent.findMany({
    where:{habitId,habit:{userId}},
    orderBy:[{occurredAt:"desc"},{id:"desc"}],
    take:60,
    select:{id:true,opportunityKey:true,eligible:true,completed:true,occurredAt:true,revision:true}
  });
}
