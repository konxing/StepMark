/**
 * Public OSF metadata discovery. NO dataset bytes are downloaded or stored.
 * Runs only from a trusted CI runner, not in the StepMark user-facing server.
 * All URLs are fixed by this source file, no secrets or user-provided domains.
 */
const PROJECTS=[
 {id:"zty5s",label:"Fiorella 2026 daily habit formation"},
 {id:"sngu4",label:"Edgren 2025 daily habit decay"},
 {id:"b69gp",label:"Edgren 2026 habit degradation"}
];
async function inspect(project){
  const base="https://api.osf.io/v2/nodes/"+project.id+"/files/";
  const endpoints=[base+"osfstorage/",base];
  const result={projectId:project.id,label:project.label,
    accessible:false,checked:[],items:[]};
  for(const url of endpoints){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(11000),redirect:"error",
        headers:{"Accept":"application/vnd.api+json","User-Agent":"StepMark-research-metadata-check/1.0"}});
      result.checked.push({endpoint:url.endsWith("osfstorage/")?"osfstorage":"providers",
        httpStatus:response.status});
      if(!response.ok)continue;
      const payload=await response.json();
      const data=Array.isArray(payload?.data)?payload.data:[];
      const items=data.slice(0,80).map(x=>({
        name:typeof x?.attributes?.name==="string"?x.attributes.name.slice(0,160):"unknown",
        kind:x?.attributes?.kind==="folder"?"folder":x?.attributes?.kind==="file"?"file":"other",
        size:Number.isSafeInteger(x?.attributes?.size)?x.attributes.size:null,
        provider:typeof x?.attributes?.provider==="string"?x.attributes.provider.slice(0,30):null
      }));
      result.accessible=true;result.items=items;
      result.hasNextPage=Boolean(payload?.links?.next);
      // A successful osfstorage listing is preferable; fallback is providers.
      break;
    }catch(e){
      result.checked.push({endpoint:url.endsWith("osfstorage/")?"osfstorage":"providers",
        error:e instanceof Error?e.name:"REQUEST_ERROR"});
    }
  }
  return result;
}
for(const project of PROJECTS){
  const result=await inspect(project);
  process.stdout.write(JSON.stringify(result)+"\n");
}
