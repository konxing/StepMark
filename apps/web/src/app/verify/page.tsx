import VerifyClient from "./verify-client";
export const dynamic="force-dynamic";
export default function VerifyPage(){return <main className="account-shell"><h1>验证 StepMark 账户</h1><p>确认邮件中的验证链接后，账户才能登录。</p><VerifyClient/></main>;}
