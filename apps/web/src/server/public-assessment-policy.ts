/**
 * Explicit current public task allowlist.
 * Only these FOUR already-published, intentionally public DEMONSTRATION
 * questions are eligible for the formCode=null code path. No private or
 * research item may inherit publishing permission from publishedAt alone.
 *
 * IDs originate from apps/web/prisma/seed.ts; preserve existing submissions.
 */
export const PUBLIC_DEMO_TASK_IDS=[
  "e085074f-728a-4e6a-84e6-159a5db11e01",
  "e085074f-728a-4e6a-84e6-159a5db11e02",
  "e085074f-728a-4e6a-84e6-159a5db11e03",
  "e085074f-728a-4e6a-84e6-159a5db11e04"
] as const;
const allowed=new Set<string>(PUBLIC_DEMO_TASK_IDS);
export function isAllowedPublicDemoTask(task:{
  id:string;version:string;constructCode:string;formCode:string|null;
}):boolean{
  return task.formCode===null && task.constructCode==="reasoning.logic" &&
    task.version==="demo-1" && allowed.has(task.id);
}
