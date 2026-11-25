import {existsSync} from "node:fs";
import {createServer} from "node:http";
import {dirname,resolve} from "node:path";
import {createInterface} from "node:readline";
import {fileURLToPath} from "node:url";
import nextEnvironment from "@next/env";
import {checkDatabase} from "../../apps/web/scripts/check-database.mjs";
import {validateProductionEnv} from "../../apps/web/scripts/production-preflight.mjs";

const webDirectory=resolve(dirname(fileURLToPath(import.meta.url)),"../../apps/web");
const host="127.0.0.1";
const port=8080;
const localOrigin=`http://${host}:${port}`;
const forwardedHeaders=["forwarded","x-forwarded-host","x-forwarded-proto","x-forwarded-port","x-forwarded-for","cf-connecting-ip","cf-ray","cf-visitor"];

async function run(){
  if(!existsSync(resolve(webDirectory,".next/BUILD_ID"))){
    throw new Error("缺少网页生产构建，请先在项目目录执行 npm run build。");
  }
  process.env.NODE_ENV="production";
  nextEnvironment.loadEnvConfig(webDirectory,false,{
    info(){},
    error(){console.error("读取网站环境配置失败。");}
  });
  const localOnly=!process.argv.includes("--public");
  process.env.STEPMARK_INGRESS_MODE=localOnly?"windows-local":"windows-loopback";
  process.env.APP_ORIGIN=localOnly?localOrigin:"https://stepmark.xin";
  // The local launcher does not infer which process rewrote a client IP header.
  delete process.env.TRUSTED_CLIENT_IP_HEADER;
  validateProductionEnv(process.env,{windowsLoopback:true});
  try{await checkDatabase();}
  catch{throw new Error("数据库未就绪，请检查连接、版本迁移和运行账户权限。");}
  console.log("配置与数据库检查通过。");

  const {default:next}=await import("next");
  const app=next({dir:webDirectory,dev:false,hostname:host,port});
  await app.prepare();
  const handle=app.getRequestHandler();
  const site=createServer((request,response)=>{
    if(localOnly&&(!request.url?.startsWith("/")||request.url.startsWith("//")||
      request.headers.host!==`${host}:${port}`||forwardedHeaders.some(name=>request.headers[name]!==undefined))){
      response.writeHead(421,{"Cache-Control":"no-store"});
      response.end("Open "+localOrigin+" to use this StepMark server.");
      return;
    }
    // Next production builds may include upgrade-insecure-requests. Local HTTP
    // stays on loopback even when the build was compiled for production HTTPS.
    if(localOnly){
      const setHeader=response.setHeader.bind(response);
      response.setHeader=(name,value)=>{
        if(name.toLowerCase()==="content-security-policy"&&typeof value==="string"){
          value=value.split(";").filter(directive=>directive.trim()!=="upgrade-insecure-requests").join(";");
        }
        return setHeader(name,value);
      };
    }
    void handle(request,response).catch(()=>{
      if(!response.headersSent)response.statusCode=500;
      response.end("StepMark request failed");
    });
  });
  await new Promise((resolve,reject)=>{
    site.once("error",reject);
    site.listen(port,host,()=>{
      site.removeListener("error",reject);
      resolve();
    });
  }).catch(()=>{throw new Error("无法监听 127.0.0.1:8080，请检查端口占用。");});
  console.log("StepMark 正在监听 "+localOrigin+" · "+(localOnly?"本机模式":"公网回源模式"));
  const control=createInterface({input:process.stdin});
  let stopping=false;
  const shutdown=()=>{
    if(stopping)return;
    stopping=true;
    console.log("正在停止网站并完成在途请求。");
    control.close();
    process.stdin.pause();
    const fallback=setTimeout(()=>process.exit(1),7000);
    fallback.unref();
    site.close(()=>{
      void app.close().then(()=>process.exit(0),()=>process.exit(1));
    });
    site.closeIdleConnections();
  };
  control.on("line",line=>{if(line.trim()==="stop")shutdown();});
  control.on("close",shutdown);
  process.once("SIGINT",shutdown);
  process.once("SIGTERM",shutdown);
}

void run().catch(error=>{
  const message=error instanceof Error?error.message:"启动失败";
  const safe=/^(?:缺少网页|数据库未就绪|无法监听)/u.test(message)||
    /^[A-Z_ /]+(?:sslmode)? is missing or unsafe for production$/u.test(message);
  console.error(safe?message:"网站启动失败，请检查构建和服务配置。");
  process.exitCode=1;
});
