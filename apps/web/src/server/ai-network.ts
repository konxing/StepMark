import {execFile} from "node:child_process";
import * as http from "node:http";
import {win32} from "node:path";
import {aiErrorMessages} from "../lib/ai-errors";

type Environment=Record<string,string|undefined>;
type ProxyEnvironment={HTTPS_PROXY:string;NO_PROXY:string;HTTP_PROXY?:string};
export type AiNetworkMode="direct"|"environment_proxy"|"windows_proxy";

function proxyUrl(raw:string):string{
  try{
    const url=new URL(raw.includes("://")?raw:"http://"+raw);
    if(!["http:","https:"].includes(url.protocol)||!url.hostname||
      url.pathname!=="/"||url.search||url.hash)throw new Error();
    return url.href;
  }catch{throw new Error("AI_PROXY_INVALID");}
}

/** WinINET supports either a shared server or separate http= / https= entries. */
export function windowsHttpsProxy(server:string):string|undefined{
  const entries=server.split(";").map(value=>value.trim()).filter(Boolean);
  const https=entries.find(value=>/^https=/i.test(value));
  const shared=entries.find(value=>!/^\w+=/.test(value));
  const selected=https?.slice(6)||shared;
  return selected?proxyUrl(selected):undefined;
}

export function proxyEnvironment(env:Environment,windowsServer?:string):{
  mode:AiNetworkMode;proxy?:ProxyEnvironment
}{
  const explicit=env.https_proxy??env.HTTPS_PROXY;
  const server=explicit?.trim()||(explicit===undefined&&env.STEPMARK_USE_SYSTEM_PROXY!=="0"?
    windowsServer:undefined);
  if(!server)return {mode:"direct"};
  const address=explicit?.trim()?proxyUrl(server):windowsHttpsProxy(server);
  if(!address)return {mode:"direct"};
  const noProxy=[env.no_proxy??env.NO_PROXY,"localhost","127.0.0.1","::1"]
    .filter(Boolean).join(",");
  const httpProxy=env.http_proxy??env.HTTP_PROXY;
  return {mode:explicit?.trim()?"environment_proxy":"windows_proxy",
    proxy:{HTTPS_PROXY:address,NO_PROXY:noProxy,...(httpProxy?.trim()?{HTTP_PROXY:proxyUrl(httpProxy)}:{})}};
}

async function readWindowsProxy():Promise<string|undefined>{
  const systemRoot=process.env.SystemRoot;
  if(!systemRoot||!win32.isAbsolute(systemRoot))return undefined;
  const program=win32.join(systemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
  const command="$settings = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if ($settings.ProxyEnable -eq 1) { [Console]::Write([string]$settings.ProxyServer) }";
  return await new Promise(resolve=>{
    execFile(program,["-NoProfile","-NonInteractive","-Command",command],{
      windowsHide:true,timeout:2500,maxBuffer:4096,encoding:"utf8"
    },(error,stdout)=>resolve(error?undefined:stdout.trim()||undefined));
  });
}

let network:Promise<AiNetworkMode>|undefined;
/** Configure once before the first completion; no system settings are changed. */
export function configureAiNetwork():Promise<AiNetworkMode>{
  return network??=(async()=>{
    const env=process.env;
    const windowsServer=process.platform==="win32"&&env.https_proxy===undefined&&
      env.HTTPS_PROXY===undefined&&env.STEPMARK_USE_SYSTEM_PROXY!=="0"?
      await readWindowsProxy():undefined;
    const config=proxyEnvironment(env,windowsServer);
    if(!config.proxy)return config.mode;
    const setProxy=(http as typeof http&{
      setGlobalProxyFromEnv?:(env:ProxyEnvironment)=>()=>void
    }).setGlobalProxyFromEnv;
    if(setProxy)setProxy(config.proxy);
    else if(config.mode!=="environment_proxy"||
      !(process.execArgv.includes("--use-env-proxy")||env.NODE_USE_ENV_PROXY==="1")){
      throw new Error("AI_PROXY_RUNTIME_UNSUPPORTED");
    }
    return config.mode;
  })();
}

/** Only fixed codes leave the server; upstream bodies and keys stay private. */
export function safeAiErrorCode(error:unknown):string|undefined{
  let current=error;
  for(let depth=0;depth<5&&current&&typeof current==="object";depth++){
    const item=current as {message?:unknown;name?:unknown;code?:unknown;cause?:unknown};
    if(typeof item.message==="string"&&Object.hasOwn(aiErrorMessages,item.message))return item.message;
    if(item.name==="TimeoutError"||item.name==="AbortError")return "AI_TIMEOUT";
    if(typeof item.code==="string"){
      if(["ENOTFOUND","EAI_AGAIN"].includes(item.code))return "AI_DNS_FAILED";
      if(["EACCES","EPERM"].includes(item.code))return "AI_NETWORK_BLOCKED";
      if(item.code==="ECONNREFUSED")return "AI_CONNECTION_REFUSED";
      if(item.code==="ETIMEDOUT"||/^UND_ERR_.*TIMEOUT$/.test(item.code))return "AI_TIMEOUT";
      if(/^(?:CERT_|ERR_TLS_|ERR_SSL_|UNABLE_TO_(?:VERIFY|GET_ISSUER)|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT)/.test(item.code))return "AI_TLS_FAILED";
    }
    current=item.cause;
  }
  return undefined;
}
