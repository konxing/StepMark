"use client";
import {useCallback,useEffect,useState} from "react";
type SkillCode="conditional"|"evidence"|"quantitative";
type PracticeTask={id:string;skillCode:SkillCode;prompt:string;
  options:{key:string;label:string}[];hint:string;bankVersion:string};
type Skill={code:SkillCode;label:string;recentlyAnswered:number;recentCorrect:number;
  wrongInLastCompletedForm:number|null};
type PracticeResponse={recommendedSkill:SkillCode|null;skill:SkillCode;
  recommendationBasis:string;lastFormCode:string|null;skills:Skill[];
  item:PracticeTask|null;todayUtc:string;notice:string};
type Feedback={correct:boolean;selectedKey:string;answerKey:string;explanation:string;
  bankVersion:string};
export default function PracticeClient(){
 const [data,setData]=useState<PracticeResponse|null>(null);
 const [skill,setSkill]=useState<SkillCode|null>(null);
 const [selected,setSelected]=useState("");
 const [feedback,setFeedback]=useState<Feedback|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("正在寻找下一道练习…");
 const load=useCallback(async(domain:SkillCode|null=null)=>{
  setLoading(true);
  try{
   const query=domain?"?skill="+domain:"";
   const response=await fetch("/api/v1/practice"+query,{cache:"no-store"});
   if(response.status===401){location.assign("/login");return;}
   if(!response.ok)throw new Error("LOAD_FAILED");
   const result=await response.json() as PracticeResponse;
   setData(result);setSkill(result.skill);setSelected("");setFeedback(null);
   setMessage(result.item?"练习题不计入 A/B 卷成绩。作答后可以立即查看解释。":
    "此类别今天的练习已完成，可以选择其他类别，或之后再练。");
  }catch{setMessage("练习题加载失败，请检查连接。");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function submit(){
  const item=data?.item;
  if(!item||busy||loading||!selected||feedback)return;
  setBusy(true);
  try{
   const response=await fetch("/api/v1/practice",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({itemId:item.id,selectedKey:selected})
   });
   if(!response.ok){
    setMessage(response.status===409?"这道题今天已经提交过，重新加载下一道即可。":
      "答题提交失败，请重试。");
    return;
   }
   const result=await response.json() as Feedback;
   setFeedback(result);
   setMessage("练习结果已保存；不会影响 A/B 卷的客观测量。");
  }catch{setMessage("网络异常，未能确认保存；请刷新后查看下一题。");}
  finally{setBusy(false);}
 }
 return <main className="account-shell assess-shell">
  <a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
  <div className="assess-top"><a href="/dashboard">← 我的成长控制台</a>
   <a href="/assess">查看独立测验</a></div>
  <div className="kicker">PRACTICE · TRAINING ONLY</div>
  <h1>推理专项训练</h1>
  <p>依据已完成的独立测验找到值得练习的题型。为了减少操作，系统默认选取上一份完整测验中答错较多的类别；
   也可以自行切换类别。这里的题与 A/B 卷完全不同，训练表现不会变成能力分。</p>
  {data?.recommendationBasis==="no_completed_form"?
   <p className="progress-caveat">尚无完整测验，先按固定顺序提供基础练习。也可先去完成 A 卷。</p>:
   <p className="progress-caveat">推荐依据：{data?.lastFormCode} 的错误题型分布。每类只有 2 道测验题，
    因此这里只是一个训练起点，不是能力诊断。</p>}
  <div className="assessment-form-list" aria-label="训练题型">
   {data?.skills.map(entry=><button type="button" key={entry.code}
     className={"assessment-form-choice"+(skill===entry.code?" active":"")}
     disabled={loading||busy}
     onClick={()=>{void load(entry.code);}}>
      <strong>{entry.label}</strong>
      <span>{entry.code===data.recommendedSkill?"当前推荐 · ":""}近期完成 {entry.recentlyAnswered} 道</span>
      {entry.wrongInLastCompletedForm!==null&&
       <small>上一份完整测验中答错 {entry.wrongInLastCompletedForm}/2 道</small>}
     </button>)}
  </div>
  {data?.item&&<section className="assess-question">
   <small>训练 · {data.skills.find(s=>s.code===data.item!.skillCode)?.label}</small>
   <h2>{data.item.prompt}</h2>
   <fieldset className="assess-options" disabled={busy||feedback!==null}>
    <legend className="visually-hidden">请选择一个答案</legend>
    {data.item.options.map(option=><label key={option.key} className="assess-option">
     <input type="radio" name="practice-answer" checked={selected===option.key}
      onChange={()=>setSelected(option.key)}/>
     <span><strong>{option.key}.</strong> {option.label}</span>
    </label>)}
   </fieldset>
   {!feedback?<><details><summary>需要一点提示</summary><p>{data.item.hint}</p></details>
    <button className="assess-button" disabled={busy||loading||!selected} onClick={submit}>
     {busy?"正在保存…":"提交练习"}
    </button></>:
    <div className="assess-feedback">
     <strong>{feedback.correct?"答对了":"这次没有选对"}</strong>
     <p>你的选择：{feedback.selectedKey}；正确选项：{feedback.answerKey}</p>
     <p>{feedback.explanation}</p>
     <button type="button" className="assess-button" disabled={loading}
      onClick={()=>{void load(skill);}}>下一道练习</button>
    </div>}
  </section>}
  {!loading&&data&&!data.item&&<section className="assess-question">
   <h2>这一类别今天已练完</h2><p>可以切换题型，或明天继续练习。</p>
  </section>}
  <p role="status" aria-live="polite">{message}</p>
  <p className="progress-caveat">训练时允许查看提示与即时解析；正式测验仍维持独立题库、延迟解析及 7 天复测间隔。
   近期训练数据的统计窗口最多为 300 条记录。每天按 UTC 日期防重复提交。</p>
 </main>;
}
