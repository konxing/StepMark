"use strict";
// All network and credential operations are Rust commands. No bearer token is
// ever returned to the webview. Render API-provided text via textContent only.
const invoke=window.__TAURI__?.core?.invoke;
const el=id=>document.getElementById(id);
let busy=false;
function message(value){el("message").textContent=value;}
function setBusy(value){
  busy=value;
  for(const id of ["login","refresh","logout"])el(id).disabled=value;
}
function showSignedIn(value){
  el("login").hidden=value;
  el("refresh").hidden=!value;
  el("logout").hidden=!value;
  if(!value){
    el("habit-count").textContent="—";
    el("list-hint").textContent="连接账号后显示";
    el("habit-list").replaceChildren();
    const p=document.createElement("p");p.className="empty";p.textContent="暂无可显示的个人数据。";
    el("habit-list").append(p);
    el("account-name").textContent="未连接账号";
  }
}
function displayHabits(data){
  const habits=Array.isArray(data?.habits)?data.habits:[];
  el("habit-count").textContent=String(habits.length);
  el("list-hint").textContent="最多显示最近 50 项未归档习惯";
  const list=el("habit-list");
  list.replaceChildren();
  if(!habits.length){
    const p=document.createElement("p");p.className="empty";p.textContent="当前没有未归档习惯。";
    list.append(p);return;
  }
  for(const habit of habits){
    const card=document.createElement("article");card.className="habit-card";
    const h3=document.createElement("h3");h3.textContent=String(habit.title??"未命名习惯");
    const action=document.createElement("p");action.textContent=String(habit.action??"");
    const cue=document.createElement("p");cue.textContent=habit.cue?"触发情境："+String(habit.cue):"";
    const meta=document.createElement("small");
    meta.textContent="已记录机会："+String(habit._count?.events??0)+" · 仅供行为追踪，不代表能力分数";
    card.append(h3,action,cue,meta);list.append(card);
  }
}
async function refresh(){
  if(busy)return;
  setBusy(true);message("正在安全读取习惯列表…");
  try{
    const [me,data]=await Promise.all([invoke("get_me"),invoke("get_habits")]);
    el("account-name").textContent=String(me?.user?.email??"已连接 StepMark 账号");
    displayHabits(data);
    message("数据已更新。桌面端暂不支持离线修改。");
  }catch(error){
    message(String(error));
    // A server-side revocation clears the native credential. Do not leave the
    // UI showing a stale signed-in state after the next refresh.
    const status=await invoke("get_status").catch(()=>null);
    if(status && !status.signedIn)showSignedIn(false);
  }
  finally{setBusy(false);}
}
async function signIn(){
  if(busy)return;
  setBusy(true);message("请在系统默认浏览器登录并确认连接，授权窗口最长等待 3 分钟。");
  try{
    await invoke("sign_in");
    showSignedIn(true);
    message("授权完成。");
  }catch(error){message(String(error));}
  finally{setBusy(false);}
  if(!busy && !el("refresh").hidden)await refresh();
}
async function signOut(){
  if(busy)return;
  setBusy(true);message("正在注销…");
  try{
    const result=await invoke("sign_out");
    showSignedIn(false);
    message(result.serverRevoked?"已从本机和服务器注销。":"本机凭据已清除，但服务器撤销尚未确认。请联网后核实账号安全。");
  }catch(error){message(String(error));}
  finally{setBusy(false);}
}
async function init(){
  if(!invoke){message("请通过 StepMark Windows 客户端启动此界面。");return;}
  el("login").addEventListener("click",signIn);
  el("refresh").addEventListener("click",refresh);
  el("logout").addEventListener("click",signOut);
  try{
    const status=await invoke("get_status");
    el("api-label").textContent=status.apiOrigin;
    showSignedIn(status.signedIn);
    if(status.signedIn)await refresh();
    else message("请连接账号。登录在外部浏览器完成，不会在桌面界面输入密码。");
  }catch(error){message(String(error));}
}
void init();
