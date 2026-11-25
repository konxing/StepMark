import {reading,review,type Candidate,type CommandExample,type Decision,type Example} from "./measurement-cases";

const comparison:Candidate={domain:"thinking",actionQuote:"我比较了两种掉线原因的解释",
  outcomeQuote:"结果支持队列拥塞的解释"};
const explanation:Candidate={domain:"expression",actionQuote:"我写了份给同事用的复现说明",
  outcomeQuote:"对方反馈按步骤复现了掉线"};
const sentence=(candidate:Candidate)=>[candidate.actionQuote,candidate.outcomeQuote].filter(Boolean).join("。")+"。";
const workCase=(id:string,message:string,expected:Example["expected"],fixture:Candidate[]):Example=>
  ({id,message,expected,fixture});
function actionCase(id:string,expected:Candidate):Example {
  return workCase(id,sentence(expected),expected,[expected]);
}

const transfer:Candidate={domain:"learning",actionQuote:"我试了上次学的折半定位方法来排查另一种卡顿",
  outcomeQuote:"实测第二轮就找到稳定的复现方法"};
const ownCheck:Candidate={domain:"thinking",actionQuote:"我检查了模型列出的三个约束",
  outcomeQuote:"复查发现其中一条和实测结果冲突"};
const possibleOutcome="结果预计会少一次返工";
const challengeWork:Example[]=[
  workCase("separate-actions",sentence(comparison)+sentence(explanation),
    [comparison,explanation],[comparison,explanation]),
  actionCase("transfer-without-keyword",transfer),
  actionCase("event-order",{domain:"observation",actionQuote:"我整理了三个版本报错的时间顺序",outcomeQuote:null}),
  actionCase("instruction-writing",{domain:"expression",actionQuote:"我写出了新人可以照着做的复现步骤",
    outcomeQuote:"对方反馈按步骤复现了问题"}),
  actionCase("cost-based-choice",{domain:"direction",actionQuote:"我决定了先验备份再升级，因为失败后还要能恢复",
    outcomeQuote:null}),
  workCase("condition-before-action","假如"+sentence(comparison),null,[comparison]),
  workCase("private-statement","请不要保存这条消息。"+sentence(comparison),null,[comparison]),
  workCase("quoted-colleague","同事在邮件里说：「"+sentence(comparison)+"」",null,[comparison]),
  workCase("estimated-result",sentence({...comparison,outcomeQuote:possibleOutcome}),
    {...comparison,outcomeQuote:null},[{...comparison,outcomeQuote:possibleOutcome}]),
  workCase("own-check-after-delegating","我让模型先整理了原始需求。然后"+sentence(ownCheck),ownCheck,[ownCheck])
];

const challengeHabit=[
  {id:"push-to-start",note:"提醒响了我还是抗拒，最后逼自己打开笔记才开始。",expected:0},
  {id:"struggle-before-opening",note:"开始前我挣扎了好一阵，最终才说服自己翻开书。",expected:1},
  {id:"brief-hesitation",note:"我拿起书前犹豫了片刻，随即翻开。",expected:2},
  {id:"little-reminding",note:"看到枕边的书，我很自然就开始读，几乎不用提醒自己。",expected:3},
  {id:"without-deliberating",note:"看见书签时，我没有考虑就翻开书开始读。",expected:4},
  {id:"easy-start",note:"坐到书桌前，我没犹豫就顺手打开笔记开始写。",expected:3},
  {id:"scheduled-completion",note:"我已经把阅读计划练熟了，今天照表完成了十页。",expected:null},
  {id:"desired-but-not-actual",note:"本来希望打开书就自动开始读，实际今天出差根本没试。",expected:null},
  {id:"deliberation-with-negation",note:"我不是不用思考就启动，开始前反复考虑了很久。",expected:1},
  {id:"other-person-start",note:"他说看到提示就下意识翻开书了，我刚开始制定这项计划。",expected:null}
] as const;

const opportunity=(habit:typeof reading,status:"done"|"missed"|"no_cue",when:"today"|"yesterday"):Decision=>
  ({kind:"opportunity",habitId:habit.id,status,when});
const commandCase=(id:string,message:string,expected:Decision,habits=[reading]):CommandExample=>
  ({id,message,expected,habits});
const challengeCommand:CommandExample[]=[
  commandCase("short-completion","今天已完成睡前阅读。",opportunity(reading,"done","today")),
  commandCase("different-habit","昨天做了晨间复盘。",opportunity(review,"done","yesterday"),[reading,review]),
  commandCase("completion-rate-question","这个月睡前阅读的完成率是多少？",{kind:"progress",habitId:reading.id}),
  commandCase("short-no-cue","昨天睡前阅读没触发。",opportunity(reading,"no_cue","yesterday")),
  commandCase("explicit-missed-opportunity","今天睡前阅读本来可以做，最后没有做。",opportunity(reading,"missed","today")),
  commandCase("undated-completion","我已经做了睡前阅读。",{kind:"none"}),
  commandCase("completion-question","今天到底算完成了睡前阅读吗？",{kind:"none"}),
  commandCase("private-completion","这件事别记录。昨天我完成了睡前阅读。",{kind:"none"}),
  commandCase("two-habits-and-dates","我昨天完成了睡前阅读，今天完成了晨间复盘。",{kind:"none"},[reading,review]),
  commandCase("future-confirmation","我计划明天完成睡前阅读，先别算今天的。",{kind:"none"})
];

export const challengeCases={
  workExamples:challengeWork,
  habitExamples:challengeHabit,
  commandExamples:challengeCommand
};
