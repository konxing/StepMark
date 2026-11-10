"use client";
import {useCallback,useEffect,useState} from "react";
type Task={id:string;version:string;prompt:string;options:{key:string;label:string}[]};
export default function AssessmentClient(){
  const [tasks,setTasks]=useState<Task[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState("正在读取评估任务…"),[feedback,setFeedback]=useState<string|null>(null);
  const [attempted,setAttempted]=useState(0);
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/v1/tasks?construct=reasoning.logic",{cache:"no-store"});
    if(response.status===401){location.assign("/login");return;}
    if(!response.ok)throw new Error("LOAD_FAILED");
    const data=await response.json() as {tasks:Task[]};
    setTasks(data.tasks);
    setMessage(data.tasks.length?"请选择答案后提交。":"当前任务已完成或题库尚未初始化。");
  },[]);
  useEffect(()=>{void refresh().catch(()=>setMessage("暂时无法加载任务。"));},[refresh]);
  const task=tasks[0];
  async function submit(){
    if(!task || !selected || busy)return;
    setBusy(true);setFeedback(null);
    try{
      const r=await fetch("/api/v1/assessments",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({taskId:task.id,selectedKey:selected})
      });
      if(!r.ok){setMessage(r.status===409?"该任务已提交过；不能重复计入评估。":"评分提交失败。");return;}
      const d=await r.json() as {correct:boolean;taskScore:number;explanation:string};
      setFeedback(`${d.correct?"正确":"暂未答对"}（此题 ${d.taskScore} 分）。${d.explanation}`);
      setAttempted(v=>v+1);setMessage("该分数仅代表本题表现，并不是你的综合能力分。");
    }catch{setMessage("网络错误，请重试。");}finally{setBusy(false);}
  }
  async function next(){setSelected("");setFeedback(null);await refresh();}
  return <main className="account-shell assess-shell">
    <a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
    <div className="assess-top"><a href="/dashboard">← 我的成长控制台</a><span>已完成本次 {attempted} 道</span></div>
    <div className="kicker">EXPERIMENTAL REASONING TASKS</div>
    <h1>逻辑推理 · 基础评估</h1>
    <p>原创演示题目尚未经过正式心理测量学验证。每道题仅能提交一次，避免重复作答影响证据质量。</p>
    {task?<div className="assess-question">
      <h2>{task.prompt}</h2>
      <fieldset disabled={busy||feedback!==null} className="assess-options">
        <legend className="visually-hidden">请选择一个答案</legend>
        {task.options.map(option=><label key={option.key} className="assess-option">
          <input type="radio" name="option" checked={selected===option.key} onChange={()=>setSelected(option.key)}/>
          <span><strong>{option.key}.</strong> {option.label}</span>
        </label>)}
      </fieldset>
      {feedback===null?<button className="assess-button" onClick={submit} disabled={!selected||busy}>{busy?"提交中…":"提交答案"}</button>:
        <><p role="status" className="assess-feedback">{feedback}</p><button className="assess-button" onClick={next}>进入下一题</button></>}
    </div>:<div className="assess-question"><p>没有可用的新题。未来会逐步增加不同难度的独立任务。</p></div>}
    <p role="status" aria-live="polite">{message}</p>
  </main>;
}
