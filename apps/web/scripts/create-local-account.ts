import {z} from "zod";
import {loadEnvConfig} from "@next/env";
import {getDb} from "../src/server/db";
import {hashPassword,normalizedEmail} from "../src/server/security";

async function main(){
  const email=z.email().max(254).safeParse(normalizedEmail(process.argv[2]??""));
  if(!email.success||process.argv.length!==3||process.stdin.isTTY)throw new Error("INVALID_INPUT");
  loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_NOT_CONFIGURED");
  const database=new URL(process.env.DATABASE_URL);
  if(!["postgresql:","postgres:"].includes(database.protocol)||
     !["localhost","127.0.0.1","[::1]"].includes(database.hostname)){
    throw new Error("LOCAL_DATABASE_REQUIRED");
  }
  process.stdin.setEncoding("utf8");
  let input="";
  for await(const chunk of process.stdin){
    input+=chunk;
    if(input.length>132)throw new Error("INVALID_INPUT");
  }
  const password=input.replace(/\r?\n$/u,"");
  if(/[\r\n]/u.test(password))throw new Error("INVALID_INPUT");
  const passwordHash=await hashPassword(password);
  const db=getDb();
  try{
    // One explicit operator action. Existing accounts keep their current
    // password and verification state.
    const existing=await db.credential.findUnique({where:{email:email.data},select:{id:true}});
    if(existing)throw new Error("ACCOUNT_EXISTS");
    await db.user.create({data:{credential:{create:{email:email.data,passwordHash,verifiedAt:new Date()}}}});
    console.log("已建立本机账号，可在 http://127.0.0.1:8080/login 登录。");
  }finally{await db.$disconnect();}
}

void main().catch(error=>{
  const message=error instanceof Error?error.message:"";
  if(message==="ACCOUNT_EXISTS")console.error("该账号已存在，请使用原账号登录。");
  else if(message==="INVALID_PASSWORD"||message==="INVALID_INPUT")console.error("请输入有效邮箱和 12 到 128 字符的密码。");
  else if(message==="DATABASE_NOT_CONFIGURED")console.error("请在网站环境文件配置 DATABASE_URL。");
  else if(message==="LOCAL_DATABASE_REQUIRED")console.error("本机建号只接受本机 PostgreSQL 地址。");
  else console.error("无法建立账号。请检查本机 PostgreSQL、数据库配置和迁移。");
  process.exitCode=1;
});
