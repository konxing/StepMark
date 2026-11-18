import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/server/db";
import {parseDesktopAuthorization,newDesktopCode,desktopCodeHash,DESKTOP_CODE_TTL_MS} from "@/server/desktop-auth";
import {appOrigin,ApiError,enforceRateLimit,errorResponse,lookupSession,requireSameOrigin,SESSION_COOKIE} from "@/server/security";

export const runtime="nodejs";
function htmlEscape(s:string):string {
  return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
}
const safeHeaders={
  "Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};
export async function GET(request:NextRequest){
  try{
    parseDesktopAuthorization(request.nextUrl.searchParams);
    const p=await lookupSession(request.cookies.get(SESSION_COOKIE)?.value,"WEB");
    if(!p){
      const next=request.nextUrl.pathname+request.nextUrl.search;
      return NextResponse.redirect(new URL("/login?next="+encodeURIComponent(next),appOrigin()),302);
    }
    const action=htmlEscape(request.nextUrl.pathname+request.nextUrl.search);
    const email=htmlEscape(p.email??"当前账号");
    const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>授权 StepMark Windows</title><style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#f5f6f2;color:#173a2c;margin:0;padding:8vh 18px}main{max-width:500px;margin:auto;background:white;border:1px solid #dae5da;border-radius:16px;padding:32px}p{line-height:1.8;color:#526b5a}button{background:#173a2c;color:white;border:0;border-radius:8px;padding:14px 24px;cursor:pointer}small{color:#65776b}</style></head><body><main><h1>连接 Windows 桌面端</h1><p>当前账号：'+email+'</p><p>确认后，StepMark Windows 将获得<strong>只读</strong>的个人账号和习惯列表访问权限。不会授予修改、删除或测评作答权限。请确认是你本人启动的桌面登录。</p><form method="post" action="'+action+'"><button type="submit">确认连接</button></form><p><small>授权码仅可使用一次，约 2 分钟后失效。你可随时在桌面端注销。</small></p></main></body></html>';
    return new NextResponse(html,{status:200,headers:{...safeHeaders,"Content-Type":"text/html; charset=utf-8"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
  try{
    requireSameOrigin(request);
    const {challenge,state,redirectUri}=parseDesktopAuthorization(request.nextUrl.searchParams);
    const p=await lookupSession(request.cookies.get(SESSION_COOKIE)?.value,"WEB");
    if(!p)throw new ApiError(401,"UNAUTHENTICATED");
    await enforceRateLimit("desktop-authorize",p.userId,10,15*60*1000);
    const now=Date.now();
    const {nonce,code}=newDesktopCode(challenge,redirectUri,now);
    await getDb().session.create({data:{
      userId:p.userId,kind:"WEB",tokenHash:desktopCodeHash(nonce),
      expiresAt:new Date(now+DESKTOP_CODE_TTL_MS)
    }});
    const callback=new URL(redirectUri);
    callback.searchParams.set("code",code);
    callback.searchParams.set("state",state);
    return NextResponse.redirect(callback,{status:303,headers:safeHeaders});
  }catch(error){return errorResponse(error);}
}
