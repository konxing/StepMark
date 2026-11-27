"use strict";

const invoke=window.__TAURI__?.core?.invoke;
const el=id=>document.getElementById(id);
const navigation=[...document.querySelectorAll("[data-view]")];
const starters=[...document.querySelectorAll("[data-starter]")];
const conversation=[];
const contextTurns=6;
const provider={configured:false,savedHere:false,verified:false};
let accountBusy=false;
let providerBusy=false;
let workBusy=false;
let signedIn=false;
let starterPrompt="";

function textElement(tag,value,className){
  const element=document.createElement(tag);
  element.textContent=value;
  if(className)element.className=className;
  return element;
}

function status(id,value,error=false){
  const line=el(id);
  line.textContent=value;
  line.dataset.error=String(error);
}

function showView(view,focus=false){
  if(view!=="connections")el("api-key").value="";
  for(const button of navigation){
    const selected=button.dataset.view===view;
    el("view-"+button.dataset.view).hidden=!selected;
    if(selected){
      button.setAttribute("aria-current","page");
      if(focus)button.focus();
    }else button.removeAttribute("aria-current");
  }
}

function syncWorkspace(){
  const started=conversation.length>0;
  el("conversation").hidden=!started;
  el("welcome").hidden=started;
  el("new-problem").hidden=!started;
  el("new-problem").disabled=workBusy;
  el("question").disabled=workBusy;
  el("question").placeholder=started?"补充事实、反馈结果，或让 AI 继续完善成果。":
    starterPrompt||"说说你希望解决什么，或希望得到什么成果。";
  el("composer-label").textContent=started?"继续这件事":"你的问题";
  el("send").textContent=workBusy?"正在处理…":started?"继续":"交给 AI";
  el("send").disabled=!provider.configured||workBusy||providerBusy;
  for(const starter of starters)starter.disabled=workBusy;
}

function syncProvider(){
  const {configured,savedHere,verified}=provider;
  el("connection-indicator").classList.toggle("ready",verified);
  el("connection-status").textContent=verified?"DeepSeek 连接正常":configured?"DeepSeek 已配置":"DeepSeek 未连接";
  el("ai-unavailable").hidden=configured;
  el("provider-label").textContent=configured?(savedHere?"Windows 凭据管理器":"环境变量") :"未配置";
  el("test-key").hidden=!configured;
  el("clear-key").hidden=!savedHere;
  for(const id of ["api-key","save-key","test-key","clear-key"])el(id).disabled=providerBusy||workBusy||!invoke;
  syncWorkspace();
}

async function readProvider(){
  const result=await invoke("deepseek_status");
  provider.configured=result.configured;
  provider.savedHere=result.savedHere;
  if(!provider.configured)provider.verified=false;
  syncProvider();
}

async function changeProvider(command,args,pending,done){
  if(providerBusy||workBusy)return;
  providerBusy=true;
  syncProvider();
  status("key-status",pending);
  try{
    await invoke(command,args);
    if(command==="save_deepseek_key")el("api-key").value="";
    provider.verified=command!=="clear_deepseek_key";
    await readProvider();
    status("key-status",done);
  }catch(error){
    if(command==="check_deepseek")provider.verified=false;
    status("key-status",String(error),true);
  }finally{
    providerBusy=false;
    syncProvider();
  }
}

async function copyOutput(button,output){
  try{
    await navigator.clipboard.writeText(output.textContent);
    button.textContent="已复制";
  }catch{
    const range=document.createRange();
    range.selectNodeContents(output);
    const selection=window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    button.textContent="已选中，请按 Ctrl+C";
  }
}

function addTurn({question,result}){
  const turn=document.createElement("article");
  turn.className="turn";
  const reply=document.createElement("section");
  reply.className="reply";
  reply.append(textElement("h3","分析"),textElement("p",result.analysis));
  if(result.deliverable.trim()){
    const deliverable=document.createElement("section");
    deliverable.className="deliverable";
    const heading=document.createElement("div");
    heading.className="output-heading";
    const button=textElement("button","复制成果","quiet");
    button.type="button";
    const output=textElement("pre",result.deliverable,"deliverable-text");
    button.addEventListener("click",()=>void copyOutput(button,output));
    heading.append(textElement("h3","可用成果"),button);
    deliverable.append(heading,output);
    reply.append(deliverable);
  }
  if(result.nextStep.trim()){
    const next=document.createElement("section");
    next.className="next-step";
    next.append(textElement("h3","下一步"),textElement("p",result.nextStep));
    reply.append(next);
  }
  turn.append(textElement("p",question,"question-bubble"),reply);
  el("conversation").append(turn);
  return turn;
}

async function sendQuestion(event){
  event.preventDefault();
  if(workBusy||providerBusy||!provider.configured)return;
  const input=el("question");
  const question=input.value.trim();
  if(!question){input.focus();return;}
  workBusy=true;
  syncProvider();
  status("work-status","DeepSeek 正在处理这件事…");
  let turn;
  try{
    const result=await invoke("work_on_problem",{question,history:conversation.slice(-contextTurns)});
    const completed={question,result};
    turn=addTurn(completed);
    conversation.push(completed);
    input.value="";
    provider.verified=true;
    status("work-status","");
  }catch(error){
    provider.verified=false;
    status("work-status",String(error),true);
  }
  finally{
    workBusy=false;
    syncProvider();
  }
  if(!el("view-workspace").hidden){
    input.focus({preventScroll:true});
    turn?.scrollIntoView({block:"start"});
  }
}

function setAccountBusy(value){
  accountBusy=value;
  for(const id of ["login","habit-login","logout","refresh"])el(id).disabled=value||!invoke;
}

function showAccount(connected,email){
  signedIn=connected;
  el("login").hidden=connected;
  el("habit-login").hidden=connected;
  el("refresh").hidden=!connected;
  el("open-assessments").hidden=!connected;
  el("logout").hidden=!connected;
  el("account-name").textContent=connected?(email||"已连接 StepMark 账号"):"未连接。连接账号后可查看习惯记录。";
  if(!connected){
    el("habit-list").replaceChildren();
    el("list-hint").textContent="连接 StepMark 账号后查看已记录的习惯。";
  }
}

const habitStages={collecting_evidence:"收集证据",developing:"形成中",maintaining:"维护观察",
  review_due:"建议复查",needs_fresh_evidence:"等待更新自评"};

function formResult(form){
  if(!form||form.status==="unavailable")return "暂不可用";
  if(Number.isInteger(form.correct))return `${form.correct} / ${form.total} 道`+
    (form.integrity==="verified"?"":" · 历史记录待核验");
  if(form.availableAt)return new Date(form.availableAt).toLocaleDateString("zh-CN")+"开放";
  return form.status==="in_progress"?"答题中":"待完成";
}

function habitDetails(habitId){
  const details=document.createElement("details");
  details.className="habit-detail";
  const body=document.createElement("div");
  body.setAttribute("role","status");
  details.append(textElement("summary","查看养成进度"),body);
  let loading=false,loaded=false;
  details.addEventListener("toggle",async()=>{
    if(!details.open||loading||loaded)return;
    loading=true;
    body.replaceChildren(textElement("p","正在读取养成进度…"));
    try{
      const [progress]=await Promise.allSettled([invoke("get_habit_progress",{habitId})]);
      if(progress.status!=="fulfilled"||!Number.isFinite(progress.value.progress)){
        body.replaceChildren(textElement("p","暂时无法读取。可收起后重试，或在网页查看记录。"));
        return;
      }
      const score=progress.value;
      const detailsRows=[
        textElement("p",`${score.progress.toFixed(1)} / 100 · ${habitStages[score.stage]??"待更新"}`,"habit-score"),
        textElement("p",`累计完成 ${score.completedRepetitions} / ${score.eligibleOpportunities} 次 · 本人自评 ${score.evidenceCount} 天`)
      ];
      if(score.recentExecution){
        const recent=score.recentExecution;
        detailsRows.push(textElement("p",`近期完成 ${recent.completed} / ${recent.eligible} 次`+
          (recent.inconsistent?" · 复查触发情境与行动难度":"")));
      }
      if(score.chatAutomaticity){
        const c=score.chatAutomaticity;
        detailsRows.push(textElement("p",`聊天启动感受 ${c.medianLow===c.medianHigh?c.medianLow:c.medianLow+"–"+c.medianHigh}/4 · ${c.days} 个执行日 · ${c.stale?"历史证据":"AI 暂定观察"}（非正式自评）`));
      }
      body.replaceChildren(...detailsRows);
      loaded=true;
    }catch{
      body.replaceChildren(textElement("p","暂时无法读取养成进度。"));
    }finally{loading=false;}
  });
  return details;
}

async function readHabits(){
  const data=await invoke("get_habits");
  const habits=data.habits;
  el("list-hint").textContent=habits.length?"当前未归档习惯（最多显示 50 项）":"当前没有未归档习惯。";
  const cards=habits.map(habit=>{
    const card=document.createElement("article");
    card.className="habit-card";
    card.append(textElement("h3",habit.title??"未命名习惯"));
    if(habit.action)card.append(textElement("p",habit.action));
    if(habit.cue)card.append(textElement("p","触发情境："+habit.cue));
    card.append(textElement("small","执行记录 "+(habit._count?.events??0)+" 条"),habitDetails(habit.id));
    return card;
  });
  el("habit-list").replaceChildren(...cards);
}

async function accountAction(command){
  if(accountBusy)return;
  setAccountBusy(true);
  const pending=command==="sign_in"?"请在系统浏览器完成登录和授权。":"正在同步账号…";
  status("account-status",pending);
  status("habit-status",pending);
  try{
    const result=await invoke(command);
    if(command==="sign_out"){
      showAccount(false);
      status("account-status",result.serverRevoked?"已注销。":"本机已注销，服务器撤销未确认。",!result.serverRevoked);
    }else{
      showAccount(true,result?.user?.email);
      await readHabits();
      status("account-status","");
    }
    status("habit-status","");
  }catch(error){
    const current=await invoke("get_status").catch(()=>null);
    if(current&&!current.signedIn)showAccount(false);
    status("account-status",String(error),true);
    status("habit-status",String(error),true);
  }finally{setAccountBusy(false);}
}

async function initializeAccount(){
  setAccountBusy(true);
  try{
    const current=await invoke("get_status");
    el("api-label").textContent=current.apiOrigin==="http://127.0.0.1:8080"?
      "本机 · "+current.apiOrigin:current.apiOrigin;
    if(current.signedIn){
      const me=await invoke("get_me");
      showAccount(true,me?.user?.email);
      await readHabits();
    }else showAccount(false);
  }catch(error){
    status("account-status",String(error),true);
    status("habit-status",String(error),true);
  }finally{setAccountBusy(false);}
}

function initialize(){
  for(const button of navigation)button.addEventListener("click",()=>showView(button.dataset.view));
  el("open-connection").addEventListener("click",()=>showView("connections",true));
  for(const starter of starters)starter.addEventListener("click",()=>{
    starterPrompt=starter.dataset.starter;
    syncWorkspace();
    el("question").focus();
  });
  el("new-problem").addEventListener("click",()=>{
    if(workBusy||!window.confirm("当前对话只保留在这个窗口。确定要开启新问题吗？"))return;
    conversation.length=0;
    starterPrompt="";
    el("conversation").replaceChildren();
    el("question").value="";
    status("work-status","");
    syncWorkspace();
    el("question").focus();
  });
  el("composer").addEventListener("submit",sendQuestion);
  el("key-form").addEventListener("submit",event=>{
    event.preventDefault();
    if(providerBusy||workBusy||!invoke)return;
    const key=el("api-key").value.trim();
    if(!key)return;
    void changeProvider("save_deepseek_key",{key},"正在验证 DeepSeek Flash…","连接成功。密钥已保存，可以回到工作台。");
  });
  el("test-key").addEventListener("click",()=>void changeProvider("check_deepseek",undefined,"正在测试 DeepSeek Flash…","连接成功，可以回到工作台。"));
  el("clear-key").addEventListener("click",()=>void changeProvider("clear_deepseek_key",undefined,"正在移除密钥…","已移除保存的本机密钥。"));
  el("login").addEventListener("click",()=>void accountAction("sign_in"));
  el("habit-login").addEventListener("click",()=>void accountAction("sign_in"));
  el("logout").addEventListener("click",()=>void accountAction("sign_out"));
  el("refresh").addEventListener("click",()=>{if(signedIn)void accountAction("get_me");});
  el("open-assessments").addEventListener("click",()=>{
    if(invoke)void invoke("open_assessments").catch(error=>status("habit-status",String(error),true));
  });
  syncProvider();
  setAccountBusy(false);
  if(!invoke){
    el("ai-unavailable-copy").textContent="请在 StepMark Windows 软件中连接 DeepSeek。";
    return;
  }
  void readProvider().catch(error=>status("key-status",String(error),true));
  void initializeAccount();
}

initialize();
