import {isIP} from "node:net";
import {z} from "zod";

/**
 * The server owns AI credentials and egress policy. Neither a client request nor
 * an LLM response may choose the destination. This module has no Next.js/Prisma
 * dependencies so the same backend can serve WeChat and future native clients.
 */
export type AiPurpose="assistant"|"habit";
export type AiProviderConfig={key:string;model:string;url:string};
type Environment=Record<string,string|undefined>;
const endpoints:Record<string,string>={
  openai:"https://api.openai.com/v1/chat/completions",
  openrouter:"https://openrouter.ai/api/v1/chat/completions",
  deepseek:"https://api.deepseek.com/chat/completions"
};
const modelPattern=/^[a-zA-Z0-9._:/-]{1,100}$/;
const completionPath=/^\/(?:[a-zA-Z0-9_-]+\/)*chat\/completions$/;
const providerFields=["PROVIDER","API_KEY","MODEL","ENDPOINT","ALLOWED_HOST"] as const;

/** Custom OpenAI-compatible endpoints are an explicit server-admin opt-in. */
export function validateCompatibleEndpoint(raw:string,allowedHost:string):string{
  let url:URL;
  try{url=new URL(raw);}catch{throw new Error("AI_PROVIDER_NOT_CONFIGURED");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.port||url.username||url.password||
     url.search||url.hash||!host.includes(".")||isIP(host)!==0||
     host==="localhost"||host.endsWith(".localhost")||
     host.endsWith(".local")||host.endsWith(".internal")||
     host.endsWith(".test")||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host)||
     host!==allowedHost.trim().toLowerCase()||
     url.pathname.length>198||!completionPath.test(url.pathname)){
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  }
  return url.href;
}
export function resolveAiProvider(purpose:AiPurpose,env:Environment=process.env):AiProviderConfig{
  // Resolve a complete configuration together. Inheriting individual fields
  // could send a habit provider's key to a different assistant provider.
  const hasSettings=(prefix:string)=>providerFields.some(field=>Boolean(env[prefix+field]?.trim()));
  const prefix=purpose==="assistant"&&hasSettings("AI_ASSISTANT_")?"AI_ASSISTANT_":"AI_HABIT_";
  const provider=env[prefix+"PROVIDER"]?.trim()||(!hasSettings(prefix)&&env.DEEPSEEK_API_KEY?.trim()?"deepseek":undefined);
  const key=env[prefix+"API_KEY"]?.trim()||(provider==="deepseek"?env.DEEPSEEK_API_KEY?.trim():undefined);
  const model=env[prefix+"MODEL"]?.trim()||(provider==="deepseek"?"deepseek-flash":undefined);
  if(!key||!model||!modelPattern.test(model)||key.length>4096||/[\r\n]/u.test(key))
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  let url=provider&&Object.hasOwn(endpoints,provider)?endpoints[provider]:undefined;
  if(provider==="compatible"){
    const endpoint=env[prefix+"ENDPOINT"];
    const host=env[prefix+"ALLOWED_HOST"];
    if(!endpoint||!host)throw new Error("AI_PROVIDER_NOT_CONFIGURED");
    url=validateCompatibleEndpoint(endpoint,host);
  }
  if(!url)throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  return {key,model,url};
}

export function isAiProviderConfigured(purpose:AiPurpose):boolean{
  try{resolveAiProvider(purpose);return true;}
  catch{return false;}
}

const envelopeSchema=z.object({
  choices:z.array(z.object({
    message:z.object({content:z.string().max(8000)}).passthrough(),
    finish_reason:z.string().nullish()
  }).passthrough()).min(1)
}).passthrough();

/**
 * One bounded, non-streaming JSON completion. A redirect must not forward an
 * Authorization header to a different origin. Cap bytes while reading, not
 * after response.text()/response.json() has already allocated arbitrary data.
 */
export async function callAiJson(config:AiProviderConfig,args:{
  messages:readonly {role:"system"|"user";content:string}[];
  timeoutMs:number;maxTokens:number;maxResponseBytes:number;
  disableThinking?:boolean;
}):Promise<unknown>{
  const isDeepSeekFlash=config.url===endpoints.deepseek &&
    ["deepseek-flash","deepseek-v4-flash","deepseek-v4-flash-vision-exp"].includes(config.model);
  const response=await fetch(config.url,{
    method:"POST",cache:"no-store",redirect:"error",
    signal:AbortSignal.timeout(args.timeoutMs),
    headers:{"Authorization":"Bearer "+config.key,"Content-Type":"application/json"},
    body:JSON.stringify({model:config.model,temperature:0,max_tokens:args.maxTokens,
      ...(args.disableThinking||isDeepSeekFlash?{thinking:{type:"disabled"}}:{}),
      response_format:{type:"json_object"},messages:args.messages})
  });
  if(!response.ok)throw new Error("AI_UPSTREAM_FAILED");
  const contentLength=response.headers.get("content-length");
  if(contentLength!==null && Number(contentLength)>args.maxResponseBytes)
    throw new Error("AI_RESPONSE_TOO_LARGE");
  if(!response.body)throw new Error("AI_RESPONSE_INVALID");
  const reader=response.body.getReader();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let output="",size=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>args.maxResponseBytes){
        await reader.cancel();
        throw new Error("AI_RESPONSE_TOO_LARGE");
      }
      output+=decoder.decode(chunk.value,{stream:true});
    }
    output+=decoder.decode();
  }finally{reader.releaseLock();}
  let raw:unknown;
  try{raw=JSON.parse(output);}catch{throw new Error("AI_RESPONSE_INVALID_JSON");}
  const envelope=envelopeSchema.safeParse(raw);
  if(!envelope.success)throw new Error("AI_RESPONSE_INVALID");
  const choice=envelope.data.choices[0]!;
  if(choice.finish_reason!=null&&choice.finish_reason!=="stop")throw new Error("AI_RESPONSE_INCOMPLETE");
  try{return JSON.parse(choice.message.content);}
  catch{throw new Error("AI_RESPONSE_INVALID_JSON");}
}
