import { ApiError, appOrigin } from "./security";

export function emailAvailable(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_FROM_EMAIL);
}
/** Fixed upstream host protects against SSRF. Do not accept URLs from the client. */
export async function sendVerification(email: string, token: string): Promise<void> {
  if (!emailAvailable()) throw new ApiError(503, "EMAIL_NOT_CONFIGURED");
  const link = `${appOrigin()}/verify?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${process.env.RESEND_API_KEY!}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      from:process.env.AUTH_FROM_EMAIL,
      to:[email],
      subject:"验证你的 StepMark 账户",
      text:`请在 24 小时内验证你的 StepMark 账户：\n${link}\n如非本人操作，请忽略本邮件。`
    }),
    signal:AbortSignal.timeout(6000),
    cache:"no-store"
  });
  if (!response.ok) throw new ApiError(503,"EMAIL_DELIVERY_FAILED");
}

export async function sendPasswordReset(email:string,token:string):Promise<void>{
  if(!emailAvailable())throw new ApiError(503,"EMAIL_NOT_CONFIGURED");
  const link=`${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":`Bearer ${process.env.RESEND_API_KEY!}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:process.env.AUTH_FROM_EMAIL,to:[email],subject:"重置 StepMark 密码",
      text:`有人请求重置 StepMark 账户密码。链接 30 分钟内有效：\n${link}\n如果不是你发起的，请忽略。`}),
    signal:AbortSignal.timeout(6000),cache:"no-store"
  });
  if(!response.ok)throw new ApiError(503,"EMAIL_DELIVERY_FAILED");
}
