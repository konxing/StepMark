import type {WorkDomain} from "../src/server/work-evidence";

export type Candidate={domain:WorkDomain;actionQuote:string;outcomeQuote:string|null};
export type Example={id:string;message:string;expected:Candidate|null;fixture:Candidate[]};
const reasoning:Candidate={domain:"thinking",actionQuote:"我比较了两套故障解释",outcomeQuote:"结果发现刷新缓存后仍可复现"};
const say=(candidate:Candidate)=>[candidate.actionQuote,candidate.outcomeQuote].filter(Boolean).join("。")+"。";
const positive=(id:string,domain:WorkDomain,actionQuote:string,outcomeQuote:string|null):Example=>{
  const expected={domain,actionQuote,outcomeQuote};
  return {id,message:say(expected),expected,fixture:[expected]};
};
const rejection=(id:string,message:string,fixture:Candidate=reasoning):Example=>({
  id,message,expected:null,fixture:[fixture]
});
const planned="结果预计会减少两次返工";
export const workExamples:Example[]=[
  positive("diagnosis","thinking",reasoning.actionQuote,reasoning.outcomeQuote),
  positive("expression","expression","我写了一份给新同事看的排查说明","对方反馈用说明定位到了问题"),
  positive("fact-check","observation","我测量了十二次接口延迟","实测中位数是四十毫秒"),
  positive("check-forecast","prediction","我验证了昨天的延迟预测","结果偏差只有三毫秒"),
  positive("transfer","learning","我用了二分法排查另一段日志","结果三轮就定位到问题"),
  positive("delivery","creation","我交付了修订后的数据核对表",null),
  positive("coordination","collaboration","我讨论了两个处理方案并和队友达成一致","收到反馈确认本轮分工可行"),
  positive("direction","direction","我决定了先做恢复验证来降低发布风险",null),
  positive("ai-reviewed","thinking","我检查了AI方案里的三条假设","结果发现第三条假设不符合实测数据"),
  {id:"two-actions",message:`${reasoning.actionQuote}。我检查了另一个项目的脚本。${reasoning.outcomeQuote}。`,
    expected:{...reasoning,outcomeQuote:null},fixture:[reasoning]},
  {id:"projected-outcome",message:`${reasoning.actionQuote}。${planned}。`,
    expected:{...reasoning,outcomeQuote:null},fixture:[{...reasoning,outcomeQuote:planned}]},
  {id:"suggested-twice",message:say(reasoning),expected:reasoning,
    fixture:[reasoning,{...reasoning,domain:"observation"}]},
  rejection("conditional","假设"+say(reasoning)),
  rejection("question",reasoning.actionQuote+"？"),
  rejection("borrowed-quote",`转述同事的原文：“运行情况如下。${say(reasoning)}”`),
  rejection("privacy-opt-out","这条别记录。"+say(reasoning)),
  rejection("future","明天"+say(reasoning)),
  rejection("assistant-delegation","我请AI写了完整的系统设计文档",{
    domain:"creation",actionQuote:"我请AI写了完整的系统设计文档",outcomeQuote:null
  }),
  rejection("invented-quote","我想了解怎么排查间歇性故障。"),
  rejection("demo","举个例子。"+say(reasoning))
];

// Frozen regression examples, not participant data or an independently sampled cohort.
export const habitExamples=[
  {id:"forced",note:"看到阅读提醒就很抗拒，最后强迫自己才开始阅读。",expected:0},
  {id:"deliberation",note:"开始前反复纠结了好久，最后才决定拿起书。",expected:1},
  {id:"hesitation",note:"开始阅读时稍微犹豫了一下，接着就翻开书了。",expected:2},
  {id:"natural",note:"看到床头的书就很自然地开始读，基本不需要刻意提醒。",expected:3},
  {id:"automatic",note:"看到书就顺手翻开读了，完全没经过思考。",expected:4},
  {id:"negated-automatic",note:"我并不是不用思考就开始，每次开始前仍要反复纠结好久。",expected:1},
  {id:"completion-only",note:"今天完成了阅读十页的任务。",expected:null},
  {id:"proficiency-only",note:"我现在做阅读理解题已经很熟练，正确率超过九成。",expected:null},
  {id:"future-only",note:"我还没有开始阅读，明天希望能不用思考就开始。",expected:null},
  {id:"third-party",note:"同事说他已经不用思考就开始跑步了，我还没有开始练习。",expected:null},
  {id:"hypothetical",note:"如果我不用思考就开始阅读，是不是就算习惯养成了？",expected:null},
  {id:"book-quote",note:"书里举例说“看到提示就下意识开始”。这是书里的例子，不是我的经历。",expected:null},
  {id:"duration-only",note:"这个习惯已经坚持了九十次，每天都做十分钟。",expected:null},
  {id:"mood-only",note:"阅读结束后感觉非常开心，今天的内容很有趣。",expected:null}
] as const;

export const reading={id:"24ebf673-828e-4c01-94ea-c0112a8cb432",title:"睡前阅读"};
export const review={id:"67ce0f80-464a-4bda-a242-a07671d2acc3",title:"晨间复盘"};
export type Decision={kind:"none"}|{kind:"create"}|{kind:"progress";habitId:string}|
  {kind:"opportunity";habitId:string;status:"done"|"missed"|"no_cue";when:"today"|"yesterday"}|
  {kind:"reflection";habitId:string;when:"today"|"yesterday"|null};
export type CommandExample={id:string;message:string;habits:typeof reading[];expected:Decision};
const opportunity=(status:"done"|"missed"|"no_cue",when:"today"|"yesterday"="today"):Decision=>
  ({kind:"opportunity",habitId:reading.id,status,when});
const command=(id:string,message:string,expected:Decision,habits=[reading]):CommandExample=>({id,message,expected,habits});
export const commandExamples:CommandExample[]=[
  command("create","帮我添加一个睡前阅读10页的习惯。",{kind:"create"},[]),
  command("done","我今天完成了睡前阅读。",opportunity("done")),
  command("missed","今天睡前阅读有机会做，但我没完成。",opportunity("missed")),
  command("no-cue","今天睡前阅读没有触发机会。",opportunity("no_cue")),
  command("yesterday","我昨天完成了睡前阅读。",opportunity("done","yesterday")),
  command("reflection","今天睡前阅读感觉很自然，不用刻意思考就开始了。",{kind:"reflection",habitId:reading.id,when:"today"}),
  command("progress","睡前阅读现在进度是多少？",{kind:"progress",habitId:reading.id}),
  command("question","我今天完成了睡前阅读吗？",{kind:"none"}),
  command("future","我明天准备完成睡前阅读。",{kind:"none"}),
  command("date-missing","我完成了睡前阅读。",{kind:"none"}),
  command("ambiguous-habit","我今天完成了。",{kind:"none"},[reading,review]),
  command("privacy-opt-out","不要记录，我今天完成了睡前阅读。",{kind:"none"}),
  command("third-party","我的同事今天完成了睡前阅读。",{kind:"none"}),
  command("opportunity-unknown","我今天没完成睡前阅读。",{kind:"none"}),
  command("conflicting-cue","今天睡前阅读没有触发机会，但是我完成了睡前阅读。",{kind:"none"})
];

