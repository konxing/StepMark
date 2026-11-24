"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {growthDimensions,growthLimits,growthPrompts,hasGrowthReview} from "@/lib/growth-practice";
import type {GrowthDimension,GrowthPlan,GrowthPractice,GrowthReview,GrowthReviewDraft} from "@/lib/growth-practice";
import styles from "./growth.module.css";

const endpoint="/api/v1/growth-practices";
const jsonHeaders={"Content-Type":"application/json"};
const dateFormat=new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"short",day:"numeric"});
const emptyPlan:GrowthPlan={dimension:"thinking",title:"",question:"",nextAction:"",successCriteria:""};
const emptyReview:GrowthReview={evidence:"",reflection:"",nextQuestion:""};

type Selection=
  | {kind:"new";key:number;dimension?:GrowthDimension;question?:string}
  | {kind:"saved";practice:GrowthPractice};
type PracticePage={practices:GrowthPractice[];nextOffset:number|null};

async function requestJson<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...init});
  if(response.status===401){
    location.assign("/login?next=/growth");
    throw new Error("登录已过期。");
  }
  if(!response.ok){
    if(response.status===409)throw new Error("记录已在别处更新。请先复制未保存内容，刷新列表后再编辑。");
    if(response.status===429)throw new Error("操作有点频繁，请稍后再试。");
    if(response.status===503)throw new Error("DeepSeek 暂未配置。你可以展开表单手动填写。");
    if(response.status===502)throw new Error("DeepSeek 暂时没有返回可用草稿。可以重试或手动填写。");
    throw new Error("操作未完成，请重试。");
  }
  return response.json() as Promise<T>;
}

function errorMessage(error:unknown){
  return error instanceof Error?error.message:"操作未完成，请重试。";
}

function PracticeEditor({selection,onDirty,onBusy,onSaved,onStartNext,onDelete}:{
  selection:Selection;
  onDirty:(value:boolean)=>void;
  onBusy:(value:boolean)=>void;
  onSaved:(practice:GrowthPractice,message:string)=>void;
  onStartNext:(practice:GrowthPractice)=>void;
  onDelete:(practice:GrowthPractice)=>Promise<void>;
}){
  const practice=selection.kind==="saved"?selection.practice:null;
  const initialPlan=practice
    ? {dimension:practice.dimension,title:practice.title,question:practice.question,
        nextAction:practice.nextAction,successCriteria:practice.successCriteria}
    : {...emptyPlan,dimension:selection.kind==="new"?selection.dimension??"thinking":"thinking",
        question:selection.kind==="new"?selection.question??"":""};
  const [plan,setPlan]=useState<GrowthPlan>(initialPlan);
  const [review,setReview]=useState<GrowthReview>(practice
    ? {evidence:practice.evidence,reflection:practice.reflection,nextQuestion:practice.nextQuestion}
    : emptyReview);
  const [showPlan,setShowPlan]=useState(false);
  const [showReview,setShowReview]=useState(Boolean(practice?.reflection||practice?.nextQuestion));
  const [aiReview,setAiReview]=useState(false);
  const [busy,setBusy]=useState<"save"|"plan"|"review"|"delete"|null>(null);
  const [message,setMessage]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const creationAttempt=useRef<{body:string;requestId:string}|null>(null);
  const prompt=growthPrompts[plan.dimension];
  const canSave=[plan.question,plan.nextAction,plan.successCriteria].every(value=>value.trim().length>=2);
  const complete=Boolean(practice?.completedAt);

  function setOperation(operation:typeof busy){
    setBusy(operation);
    onBusy(operation!==null);
  }
  function changePlan<K extends keyof GrowthPlan>(key:K,value:GrowthPlan[K]){
    setPlan(old=>({...old,[key]:value}));
    onDirty(true);
  }
  function changeReview(key:keyof GrowthReview,value:string){
    if(key==="evidence"&&aiReview)setReview({...emptyReview,evidence:value});
    else setReview(old=>({...old,[key]:value}));
    if(aiReview&&key!=="nextQuestion")setAiReview(false);
    setMessage("");
    onDirty(true);
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||complete)return;
    const submitter=(event.nativeEvent as SubmitEvent).submitter;
    const finish=submitter instanceof HTMLButtonElement&&submitter.value==="complete";
    if(!canSave)return;
    if(finish&&!hasGrowthReview(review)){
      setMessage("请先写下实际观察到的结果，以及这次实践改变了什么判断。");
      return;
    }
    setOperation("save");
    setMessage("");
    try{
      let data:object;
      if(practice){
        data={...plan,...review,revision:practice.revision,complete:finish};
      }else{
        const body=JSON.stringify(plan);
        if(creationAttempt.current?.body!==body)creationAttempt.current={body,requestId:crypto.randomUUID()};
        data={...plan,requestId:creationAttempt.current.requestId};
      }
      const result=await requestJson<{practice:GrowthPractice}>(
        practice?endpoint+"/"+practice.id:endpoint,
        {method:practice?"PUT":"POST",headers:jsonHeaders,body:JSON.stringify(data)}
      );
      onSaved(result.practice,finish?"已完成复盘。":practice?"实践已保存。":"已开始实践。行动后回来记录实证。");
    }catch(error){setMessage(errorMessage(error));}
    finally{setOperation(null);}
  }
  async function generateDraft(mode:"plan"|"review"){
    if(busy||plan.question.trim().length<2)return;
    if(mode==="review"&&(!canSave||review.evidence.trim().length<2))return;
    setOperation(mode);
    setMessage("");
    try{
      const {question,nextAction,successCriteria}=plan;
      const payload=mode==="plan"?{mode,question}:{mode,question,nextAction,successCriteria,evidence:review.evidence};
      const request:RequestInit={
        method:"POST",headers:jsonHeaders,
        body:JSON.stringify({...payload,consentToAI:true})
      };
      if(mode==="plan"){
        const {draft}=await requestJson<{draft:Omit<GrowthPlan,"question">}>(endpoint+"/feedback",request);
        setPlan({...draft,question});
        setShowPlan(true);
        setMessage("计划已拟好。可以直接开始或先调整。");
      }else{
        const {draft}=await requestJson<{draft:GrowthReviewDraft}>(endpoint+"/feedback",request);
        setReview(old=>({...old,...draft}));
        setAiReview(true);
        setShowReview(true);
        setMessage("复盘已拟好。确认判断和下一问后即可保存。");
      }
      onDirty(true);
    }catch(error){setMessage(errorMessage(error));}
    finally{setOperation(null);}
  }
  async function deletePractice(){
    if(!practice||busy)return;
    setOperation("delete");
    setMessage("");
    try{await onDelete(practice);}
    catch(error){setMessage(errorMessage(error));}
    finally{setOperation(null);}
  }

  return <article className={styles.editor} aria-labelledby="practice-editor-title">
    <div className={styles.editorHeading}>
      <h2 id="practice-editor-title">{practice?complete?practice.title:"继续实践":"开启一次实践"}</h2>
      {practice&&<span className={styles.state}>{complete?"已复盘":"进行中"}</span>}
    </div>
    {complete&&practice?<dl className={styles.readback}>
      <div><dt>实践方向</dt><dd>{growthPrompts[practice.dimension].label}</dd></div>
      <div><dt>起初的问题</dt><dd>{practice.question}</dd></div>
      <div><dt>行动与验收</dt><dd>{practice.nextAction}</dd><dd>{practice.successCriteria}</dd></div>
      <div><dt>实际观察</dt><dd>{practice.evidence}</dd></div>
      <div><dt>判断如何改变</dt><dd>{practice.reflection}</dd></div>
      {practice.nextQuestion&&<div><dt>下一个问题</dt><dd>{practice.nextQuestion}</dd></div>}
    </dl>:<form className={styles.form} onSubmit={save}>
      {(!practice||showPlan)&&<fieldset className={styles.fields} disabled={busy!==null}>
        <label className={styles.wide}>我想弄明白的问题
          <textarea required minLength={2} maxLength={growthLimits.question} rows={2} value={plan.question}
            onChange={event=>changePlan("question",event.target.value)} placeholder={prompt.question}/>
        </label>
        {showPlan&&<><label>我想练什么
          <select value={plan.dimension} onChange={event=>changePlan("dimension",event.target.value as GrowthDimension)}>
            {growthDimensions.map(dimension=><option key={dimension} value={dimension}>{growthPrompts[dimension].label}</option>)}
          </select>
        </label>
        <label>实践名称<span className={styles.optional}>选填</span>
          <input maxLength={growthLimits.title} value={plan.title}
            onChange={event=>changePlan("title",event.target.value)} placeholder="留空时使用问题的第一行"/>
        </label>
        <label>能先做哪一小步？
          <textarea required minLength={2} maxLength={growthLimits.nextAction} rows={3} value={plan.nextAction}
            onChange={event=>changePlan("nextAction",event.target.value)} placeholder={prompt.action}/>
        </label>
        <label>我准备怎样验证？
          <textarea required minLength={2} maxLength={growthLimits.successCriteria} rows={3} value={plan.successCriteria}
            onChange={event=>changePlan("successCriteria",event.target.value)} placeholder={prompt.criterion}/>
        </label>
        </>}
      </fieldset>}
      {!practice&&<div className={styles.ai}>
        <div className={styles.actions}>
          <button type="button" className={canSave?styles.secondary:styles.primary}
            disabled={busy!==null||plan.question.trim().length<2} onClick={()=>void generateDraft("plan")}>
            {busy==="plan"?"正在拟计划…":canSave?"让 AI 重新拟计划":"让 AI 制定计划"}
          </button>
          {!showPlan&&<button type="button" className={styles.quiet} disabled={busy!==null}
            onClick={()=>setShowPlan(true)}>手动填写</button>}
        </div>
        <p>点击后，本次问题将发送给 DeepSeek。</p>
      </div>}
      {practice&&!showPlan&&<div>
        <dl className={styles.readback}>
          <div><dt>这次的问题</dt><dd>{plan.question}</dd></div>
          <div><dt>下一步行动</dt><dd>{plan.nextAction}</dd></div>
          <div><dt>怎样验证</dt><dd>{plan.successCriteria}</dd></div>
        </dl>
        <button type="button" className={styles.quiet} disabled={busy!==null} onClick={()=>setShowPlan(true)}>编辑计划</button>
      </div>}
      {practice&&<fieldset className={styles.fields} disabled={busy!==null}>
        <legend>行动后的复盘</legend>
        <label className={styles.wide}>实际发生了什么？
          <textarea maxLength={growthLimits.evidence} rows={3} value={review.evidence}
            onChange={event=>changeReview("evidence",event.target.value)}
            placeholder="写下能核对的结果，例如一次测试、一段作品、他人的反馈或现场观察。"/>
        </label>
        {showReview&&<><label>这次的观察支持什么判断？
          <textarea maxLength={growthLimits.reflection} rows={3} value={review.reflection}
            onChange={event=>changeReview("reflection",event.target.value)}
            placeholder="哪些结果符合预期？哪些相反？你打算保留或修正哪个判断？"/>
        </label>
        <label>接下来还想弄明白什么？<span className={styles.optional}>选填</span>
          <textarea maxLength={growthLimits.nextQuestion} rows={3} value={review.nextQuestion}
            onChange={event=>changeReview("nextQuestion",event.target.value)} placeholder="可以留下一个问题作为下一次实践的起点。"/>
        </label>
        </>}
      </fieldset>}
      {practice&&<div className={styles.ai}>
        <div className={styles.actions}>
          <button type="button" className={showReview?styles.secondary:styles.primary}
            disabled={busy!==null||!canSave||review.evidence.trim().length<2} onClick={()=>void generateDraft("review")}>
            {busy==="review"?"正在整理复盘…":"让 AI 整理复盘"}
          </button>
          {!showReview&&<button type="button" className={styles.quiet} disabled={busy!==null}
            onClick={()=>setShowReview(true)}>手动复盘</button>}
        </div>
        <p>点击后，本次问题、行动、验证标准和实际观察将发送给 DeepSeek。</p>
      </div>}
      <div className={styles.actions}>
        {practice&&showReview&&<button type="submit" className={styles.primary}
          disabled={busy!==null||!canSave||!hasGrowthReview(review)} value="complete">
          {busy==="save"?"正在保存…":"确认并完成复盘"}
        </button>}
        {(practice||showPlan)&&<button type="submit" className={practice?styles.secondary:styles.primary}
          disabled={busy!==null||!canSave} value="save">
          {busy==="save"?"正在保存…":practice?"保存进展":"确认并开始实践"}
        </button>}
      </div>
    </form>}
    {complete&&practice&&<button type="button" className={styles.primary} onClick={()=>onStartNext(practice)}>
      {practice.nextQuestion?"用下一个问题开启实践":"开启下一次实践"}
    </button>}
    {practice&&<div className={styles.deleteRow}>
      {confirmDelete?<>
        <span>删除后无法恢复这次实践。</span>
        <button type="button" className={styles.danger} disabled={busy!==null} onClick={deletePractice}>确认删除</button>
        <button type="button" className={styles.quiet} disabled={busy!==null} onClick={()=>setConfirmDelete(false)}>取消</button>
      </>:<button type="button" className={styles.quiet} disabled={busy!==null} onClick={()=>setConfirmDelete(true)}>删除记录</button>}
    </div>}
    <p className={styles.message} role="status">{message}</p>
  </article>;
}

export default function GrowthPracticeClient(){
  const [items,setItems]=useState<GrowthPractice[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [selection,setSelection]=useState<Selection>({kind:"new",key:0});
  const [dirty,setDirty]=useState(false);
  const [editorBusy,setEditorBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState("");
  const [notice,setNotice]=useState("");
  const editor=useRef<HTMLElement|null>(null);
  const draftKey=useRef(0);
  const listRevision=useRef(0);

  async function load(offset=0,signal?:AbortSignal){
    const startedAt=listRevision.current;
    setLoading(true);
    setListError("");
    try{
      const page=await requestJson<PracticePage>(endpoint+"?offset="+offset,signal?{signal}:undefined);
      if(signal?.aborted)return;
      if(listRevision.current!==startedAt){
        await load(0,signal);
        return;
      }
      setItems(previous=>offset===0?page.practices:[
        ...previous,...page.practices.filter(row=>!previous.some(item=>item.id===row.id))
      ]);
      setNextOffset(page.nextOffset);
    }catch(error){
      if(signal?.aborted)return;
      if(listRevision.current!==startedAt)await load(0,signal);
      else setListError(errorMessage(error));
    }
    finally{if(!signal?.aborted)setLoading(false);}
  }

  useEffect(()=>{
    const controller=new AbortController();
    void load(0,controller.signal);
    return ()=>controller.abort();
  },[]);

  useEffect(()=>{
    if(!dirty)return;
    function beforeUnload(event:BeforeUnloadEvent){
      event.preventDefault();
    }
    window.addEventListener("beforeunload",beforeUnload);
    return ()=>window.removeEventListener("beforeunload",beforeUnload);
  },[dirty]);

  function mayLeave(){
    return !dirty||window.confirm("当前有未保存的内容。确定要离开吗？");
  }
  function open(next:Selection){
    if(editorBusy||!mayLeave())return;
    setDirty(false);
    setNotice("");
    setSelection(next);
    editor.current?.focus({preventScroll:true});
    editor.current?.scrollIntoView({block:"start"});
  }
  function newPractice(previous?:GrowthPractice){
    draftKey.current+=1;
    open(previous?{kind:"new",key:draftKey.current,dimension:previous.dimension,question:previous.nextQuestion}
      :{kind:"new",key:draftKey.current});
  }
  function saved(practice:GrowthPractice,message:string){
    listRevision.current+=1;
    const alreadyListed=items.some(item=>item.id===practice.id);
    setItems(old=>alreadyListed?old.map(item=>item.id===practice.id?practice:item):[practice,...old]);
    if(!alreadyListed)setNextOffset(old=>old===null?null:old+1);
    setSelection({kind:"saved",practice});
    setDirty(false);
    setNotice(message);
    editor.current?.focus({preventScroll:true});
  }
  async function remove(practice:GrowthPractice){
    await requestJson<{ok:boolean}>(endpoint+"/"+practice.id,{method:"DELETE"});
    listRevision.current+=1;
    setItems(old=>old.filter(item=>item.id!==practice.id));
    setNextOffset(old=>old===null?null:Math.max(0,old-1));
    draftKey.current+=1;
    setSelection({kind:"new",key:draftKey.current});
    setDirty(false);
    setNotice("实践已删除。");
  }
  const key=selection.kind==="new"?"draft-"+selection.key:selection.practice.id+"-"+selection.practice.revision;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link href="/dashboard" className="wordmark" onClick={event=>{if(!mayLeave())event.preventDefault();}}>
        STEP<span>MARK</span><span className="brand-dot">.</span>
      </Link>
      <nav className={styles.nav} aria-label="自主实践导航">
        <a href="#practice-history" className={styles.back}>我的实践</a>
        <Link href="/dashboard" className={styles.back} onClick={event=>{if(!mayLeave())event.preventDefault();}}>返回控制台</Link>
      </nav>
    </header>
    <section className={styles.hero} aria-labelledby="growth-title">
      <div className={styles.heroInner}>
        <h1 id="growth-title">自主实践</h1>
        <p>从一个你真正在意的问题出发。做一小步，用实际结果修正判断，再决定接下来学什么、做什么。</p>
        <ol className={styles.path}>
          <li>发现问题</li><li>动手验证</li><li>记录证据</li><li>决定下一步</li>
        </ol>
      </div>
    </section>
    <div className={styles.workspace}>
      <section className={styles.main} ref={editor} tabIndex={-1} aria-label="实践记录编辑区">
        {notice&&<p className={styles.saved} role="status">{notice}</p>}
        <PracticeEditor key={key} selection={selection} onDirty={setDirty} onBusy={setEditorBusy} onSaved={saved}
          onStartNext={newPractice} onDelete={remove}/>
      </section>
      <aside id="practice-history" className={styles.history} aria-labelledby="practice-history-title">
        <div className={styles.editorHeading}>
          <h2 id="practice-history-title">我的实践</h2>
          <button type="button" className={styles.quiet} disabled={editorBusy} onClick={()=>newPractice()}>新建</button>
        </div>
        {loading&&items.length===0&&<p role="status">正在读取实践…</p>}
        {listError&&<p role="status">{listError}</p>}
        {!loading&&!listError&&items.length===0&&<p>开始一次实践后，可以在这里接着记录或回看复盘。</p>}
        <ul className={styles.entries}>
          {items.map(item=><li key={item.id}>
            <button type="button" disabled={editorBusy} aria-current={selection.kind==="saved"&&selection.practice.id===item.id?"true":undefined}
              onClick={()=>open({kind:"saved",practice:item})}>
              <strong>{item.title}</strong>
              <span>{growthPrompts[item.dimension].label} · {item.completedAt?"已复盘":"进行中"}</span>
              <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            </button>
          </li>)}
        </ul>
        {nextOffset!==null&&<button type="button" disabled={loading||editorBusy} className={styles.quiet}
          onClick={()=>void load(nextOffset)}>{loading?"读取中…":"加载更多"}</button>}
        <button type="button" disabled={loading||editorBusy} className={styles.quiet} onClick={()=>void load()}>
          {listError?"重试":"刷新列表"}
        </button>
      </aside>
    </div>
  </main>;
}
