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
  openrouter:"https://openrouter.ai/api/v1/chat/completions"
};
const modelPattern=/^[a-zA-Z0-9._:/-]{1,100}$/;

function setting(env:Environment,purpose:AiPurpose,suffix:string):string|undefined{
  const assistant=env["AI_ASSISTANT_"+suffix];
  return purpose==="assistant" ? (assistant??env["AI_HABIT_"+suffix]) : env["AI_HABIT_"+suffix];
}

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
     !/^\/[a-zA-Z0-9/_-]{0,180}\/chat\/completions$/.test(url.pathname)){
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  }
  return url.href;
}
export function resolveAiProvider(purpose:AiPurpose,env:Environment=process.env):AiProviderConfig{
  const provider=setting(env,purpose,"PROVIDER");
  const key=setting(env,purpose,"API_KEY");
  const model=setting(env,purpose,"MODEL");
  if(!key||!model||!modelPattern.test(model)||key.length>4096)
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  let url=endpoints[provider??""];
  if(provider==="compatible"){
    const endpoint=setting(env,purpose,"ENDPOINT");
    const host=setting(env,purpose,"ALLOWED_HOST");
    if(!endpoint||!host)throw new Error("AI_PROVIDER_NOT_CONFIGURED");
    url=validateCompatibleEndpoint(endpoint,host);
  }
  if(!url)throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  return {key,model,url};
}

const envelopeSchema=z.object({
  choices:z.array(z.object({
    message:z.object({content:z.string().max(8000)}).passthrough()
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
}):Promise<unknown>{
  const response=await fetch(config.url,{
    method:"POST",cache:"no-store",redirect:"error",
    signal:AbortSignal.timeout(args.timeoutMs),
    headers:{"Authorization":"Bearer "+config.key,"Content-Type":"application/json"},
    body:JSON.stringify({model:config.model,temperature:0,max_tokens:args.maxTokens,
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
  try{return JSON.parse(envelope.data.choices[0]!.message.content);}
  catch{throw new Error("AI_RESPONSE_INVALID_JSON");}
}
