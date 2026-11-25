import {fileURLToPath} from "node:url";
import {loadEnvConfig} from "@next/env";
import {callAiJson,resolveAiProvider} from "../src/server/ai-gateway";
import {configureAiNetwork,safeAiErrorCode} from "../src/server/ai-network";
import {aiErrorMessage} from "../src/lib/ai-errors";

async function main(){
  if(process.argv.length!==2)throw new Error("INVALID_DIAGNOSTIC_ARGS");
  loadEnvConfig(fileURLToPath(new URL("..",import.meta.url)),false,{info(){},error(){}});
  const config=resolveAiProvider("assistant");
  if(config.url!=="https://api.deepseek.com/chat/completions"){
    throw new Error("DIAGNOSTIC_REQUIRES_OFFICIAL_DEEPSEEK");
  }
  const mode=await configureAiNetwork();
  console.log("DeepSeek 连接方式："+({direct:"直接连接",environment_proxy:"环境变量代理",windows_proxy:"Windows 系统代理"}[mode]));
  const started=performance.now();
  const result=await callAiJson(config,{
    messages:[{role:"system",content:'This is a connectivity test. Return only this JSON object: {"ok":true}.'},
      {role:"user",content:"Test connection."}],
    timeoutMs:20_000,maxTokens:32,maxResponseBytes:4096,disableThinking:true
  });
  if(!result||typeof result!=="object"||!("ok" in result)||result.ok!==true){
    throw new Error("AI_RESPONSE_INVALID");
  }
  console.log("DeepSeek 实测成功：收到有效回复，用时 "+Math.round(performance.now()-started)+" 毫秒。回复通过原请求返回到本机。");
}

void main().catch(error=>{
  const code=safeAiErrorCode(error);
  const configuration=error instanceof Error&&error.message==="AI_PROVIDER_NOT_CONFIGURED";
  console.error("DeepSeek 实测未通过："+(aiErrorMessage(code)??(configuration?
    "请在 apps/web/.env.local 配置 DeepSeek 密钥和服务商。":"请检查 DeepSeek 配置和 Node.js 安装。")));
  console.error("诊断代码："+(code??(configuration?"AI_PROVIDER_NOT_CONFIGURED":"AI_DIAGNOSTIC_FAILED")));
  process.exitCode=1;
});
