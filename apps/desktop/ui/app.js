"use strict";

const invoke=window.__TAURI__?.core?.invoke;
const el=id=>document.getElementById(id);
const navigation=[...document.querySelectorAll("[data-view]")];
const examples=[...document.querySelectorAll("[data-example]")];
const conversation=[];
const contextTurns=6;
const provider={configured:false,savedHere:false,verified:false};
let accountBusy=false;
let providerBusy=false;
let workBusy=false;
let signedIn=false;
let retestBusy=false;
let retestQuestion=null;
let retestChoice=null;

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
  if(view==="retest")void loadRetest();
}

function syncWorkspace(){
  const started=conversation.length>0;
  el("conversation").hidden=!started;
  el("welcome").hidden=started;
  el("new-problem").hidden=!started;
  el("new-problem").disabled=workBusy;
  el("question").disabled=workBusy;
  el("question").placeholder=started?"补充事实、反馈结果，或让 AI 继续完善成果。":"例如，遇到了什么现象？你希望产出什么？";
  el("composer-label").textContent=started?"继续这件事":"你的问题";
  el("send").textContent=workBusy?"正在处理…":started?"继续":"交给 AI";
  el("send").disabled=!provider.configured||workBusy||providerBusy;
  for(const example of examples)example.disabled=workBusy;
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
  if(result.retestTopic==="limits"||result.retestTopic==="evidence"){
    const retest=textElement("button","独立做一道题","quiet retest-link");
    retest.type="button";
    retest.addEventListener("click",()=>{
      if(retestBusy)return;
      el("retest-topic").value=result.retestTopic;
      showView("retest",true);
    });
    reply.append(retest);
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
  el("logout").hidden=!connected;
  el("account-name").textContent=connected?(email||"已连接 StepMark 账号"):"未连接。连接账号后可查看习惯记录。";
  if(!connected){
    el("habit-list").replaceChildren();
    el("list-hint").textContent="连接 StepMark 账号后查看已记录的习惯。";
  }
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
    card.append(textElement("small","已记录机会："+(habit._count?.events??0)));
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
    el("api-label").textContent=current.apiOrigin;
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

const retestDate=new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium",timeStyle:"short"});

function setRetestBusy(value){
  retestBusy=value;
  for(const id of ["retest-topic","retest-refresh"])el(id).disabled=value;
  el("retest-submit").disabled=value||retestChoice===null;
}

function renderRetest(review,submittedId){
  retestQuestion=review.question;
  retestChoice=null;
  el("retest-form").hidden=!retestQuestion;
  el("retest-feedback").hidden=true;
  el("retest-refresh").hidden=!review.nextAt;
  el("retest-next").textContent=review.nextAt?`下一道新题在 ${retestDate.format(review.nextAt)} 开放。`:
    !retestQuestion?"这组新题已完成。你可以换一组，或回看解析。":"";
  const attempts=review.attempts;
  el("retest-summary").textContent=attempts.length?
    `首答 ${attempts.length} / ${review.total} 道，答对 ${attempts.filter(entry=>entry.correct).length} 道。`:"还没有作答记录。";
  el("retest-history").hidden=attempts.length===0;
  el("retest-attempts").replaceChildren(...attempts.map(entry=>{
    const row=document.createElement("li");
    row.append(textElement("strong",entry.correct?"答对":"待巩固"),
      textElement("p",entry.explanation),textElement("small",retestDate.format(entry.attempt.recordedAt)));
    return row;
  }));
  const submitted=attempts.find(entry=>entry.attempt.itemId===submittedId);
  if(submitted){
    const feedback=el("retest-feedback");
    feedback.hidden=false;
    feedback.replaceChildren(textElement("strong",submitted.correct?"这次答对了":"这次需要再巩固"),
      textElement("p",submitted.explanation));
  }
  if(!retestQuestion)return;
  el("retest-prompt").textContent=retestQuestion.prompt;
  el("retest-options").replaceChildren(...retestQuestion.options.map((label,index)=>{
    const option=document.createElement("label");
    const input=document.createElement("input");
    input.name="retest-answer";
    input.type="radio";
    input.addEventListener("change",()=>{
      retestChoice=index;
      el("retest-submit").disabled=retestBusy;
    });
    option.append(input,textElement("span",label));
    return option;
  }));
}

async function loadRetest(){
  if(retestBusy)return;
  if(!invoke){status("retest-status","请在 StepMark Windows 客户端打开复测。",true);return;}
  el("retest-form").hidden=true;
  el("retest-feedback").hidden=true;
  el("retest-history").hidden=true;
  el("retest-summary").textContent="";
  el("retest-next").textContent="";
  setRetestBusy(true);
  status("retest-status","正在读取本机复测记录…");
  try{
    renderRetest(await invoke("get_retest",{topic:el("retest-topic").value}));
    status("retest-status","");
  }catch(error){
    el("retest-refresh").hidden=false;
    status("retest-status",String(error),true);
  }finally{setRetestBusy(false);}
}

async function submitRetest(event){
  event.preventDefault();
  if(retestBusy||!retestQuestion||retestChoice===null)return;
  const {id}=retestQuestion;
  setRetestBusy(true);
  el("retest-question").disabled=true;
  try{
    const review=await invoke("submit_retest",{topic:el("retest-topic").value,id,choice:retestChoice});
    renderRetest(review,id);
    status("retest-status","首次答案已保存。");
  }catch(error){status("retest-status",String(error),true);}
  finally{
    el("retest-question").disabled=false;
    setRetestBusy(false);
  }
}

function initialize(){
  for(const button of navigation)button.addEventListener("click",()=>showView(button.dataset.view));
  el("open-connection").addEventListener("click",()=>showView("connections",true));
  for(const example of examples)example.addEventListener("click",()=>{
    const input=el("question");
    if(!input.value.trim())input.value=example.dataset.example;
    input.focus();
  });
  el("new-problem").addEventListener("click",()=>{
    if(workBusy||!window.confirm("当前对话只保留在这个窗口。确定要开启新问题吗？"))return;
    conversation.length=0;
    el("conversation").replaceChildren();
    el("question").value="";
    status("work-status","");
    syncWorkspace();
    el("question").focus();
  });
  el("composer").addEventListener("submit",sendQuestion);
  el("retest-topic").addEventListener("change",loadRetest);
  el("retest-refresh").addEventListener("click",loadRetest);
  el("retest-form").addEventListener("submit",submitRetest);
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
