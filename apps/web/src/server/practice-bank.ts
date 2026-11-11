/** Independent ORIGINAL coaching items; never published as calibrated form tasks. */
export const PRACTICE_BANK_VERSION="reasoning-practice-1" as const;
export const PRACTICE_SKILLS=[
 {code:"conditional",label:"条件推理"},
 {code:"evidence",label:"论证与证据"},
 {code:"quantitative",label:"数量与比例"}
] as const;
export type PracticeSkill=typeof PRACTICE_SKILLS[number]["code"];
export interface PracticeItem {
 id:string;skillCode:PracticeSkill;prompt:string;
 options:readonly {key:string;label:string}[];
 answerKey:string;hint:string;explanation:string;
}
export const PRACTICE_BANK:readonly PracticeItem[]=[
  {
    "id": "practice-cond-01",
    "skillCode": "conditional",
    "prompt": "如果一次上线通过全部自动化测试，就会生成测试报告。此次没有生成测试报告。根据题意能推出什么？",
    "options": [
      {
        "key": "A",
        "label": "此次上线通过了全部测试"
      },
      {
        "key": "B",
        "label": "此次上线没有通过全部测试"
      },
      {
        "key": "C",
        "label": "服务器必然已经关机"
      },
      {
        "key": "D",
        "label": "所有测试都没有运行"
      }
    ],
    "answerKey": "B",
    "explanation": "将‘通过测试’记为 P，‘生成报告’记为 Q；P→Q 与非 Q 联合推出非 P（否定后件）。",
    "hint": "先区分条件 P 和结果 Q，再使用逆否命题。"
  },
  {
    "id": "practice-cond-02",
    "skillCode": "conditional",
    "prompt": "如果某请求携带有效签名，则服务器接受它。服务器接受了一条请求。以下唯一严谨的判断是？",
    "options": [
      {
        "key": "A",
        "label": "该请求一定携带有效签名"
      },
      {
        "key": "B",
        "label": "只能说请求被接受，无法据此确定签名是否有效"
      },
      {
        "key": "C",
        "label": "该请求不可能携带有效签名"
      },
      {
        "key": "D",
        "label": "所有有效签名都会被拒绝"
      }
    ],
    "answerKey": "B",
    "explanation": "P→Q 并不意味着 Q→P。由结果成立倒推唯一原因，属于肯定后件错误。",
    "hint": "检查题干是不是只提供了充分条件，而不是充要条件。"
  },
  {
    "id": "practice-cond-03",
    "skillCode": "conditional",
    "prompt": "某任务要么由甲完成，要么由乙完成，且两人不能同时完成。已知甲没有完成。可以推出什么？",
    "options": [
      {
        "key": "A",
        "label": "乙完成了任务"
      },
      {
        "key": "B",
        "label": "任务一定没有完成"
      },
      {
        "key": "C",
        "label": "甲和乙都完成了"
      },
      {
        "key": "D",
        "label": "题目不足以确定乙"
      }
    ],
    "answerKey": "A",
    "explanation": "在题目明确规定‘二者恰有其一’的前提下，排除甲后，乙必然成立。",
    "hint": "注意‘恰有其一’和‘至少一个’在逻辑上不同。"
  },
  {
    "id": "practice-cond-04",
    "skillCode": "conditional",
    "prompt": "已知 A 发生会导致 B 发生，B 发生会导致 C 发生。现在 C 没有发生。以下哪项必然成立？",
    "options": [
      {
        "key": "A",
        "label": "A 已经发生"
      },
      {
        "key": "B",
        "label": "A 没有发生"
      },
      {
        "key": "C",
        "label": "B 一定发生"
      },
      {
        "key": "D",
        "label": "C 发生与 A 无关"
      }
    ],
    "answerKey": "B",
    "explanation": "A→B→C 蕴含 A→C，否定 C 可推出否定 A。",
    "hint": "先合并蕴含链，再尝试逆否。"
  },
  {
    "id": "practice-cond-05",
    "skillCode": "conditional",
    "prompt": "已知‘所有通过安全审查的组件都已登记’，且‘组件 X 未登记’。下列哪项必然成立？",
    "options": [
      {
        "key": "A",
        "label": "组件 X 通过了安全审查"
      },
      {
        "key": "B",
        "label": "组件 X 未通过安全审查"
      },
      {
        "key": "C",
        "label": "组件 X 属于第三方组件"
      },
      {
        "key": "D",
        "label": "所有已登记组件都通过审查"
      }
    ],
    "answerKey": "B",
    "explanation": "所有通过审查者都已登记；未登记者必不属于通过审查者。不能反推所有已登记者都通过审查。",
    "hint": "尝试将全称命题写成‘通过审查→已登记’。"
  },
  {
    "id": "practice-evid-01",
    "skillCode": "evidence",
    "prompt": "某公司试行弹性办公后离职率下降，但同期提高了工资。怎样才能更可靠地判断弹性办公是否有效？",
    "options": [
      {
        "key": "A",
        "label": "把离职率下降全部归因于弹性办公"
      },
      {
        "key": "B",
        "label": "找出薪酬与其他条件相近的对照组进行比较"
      },
      {
        "key": "C",
        "label": "只采访仍在职的员工"
      },
      {
        "key": "D",
        "label": "不记录时间跨度"
      }
    ],
    "answerKey": "B",
    "explanation": "调薪是潜在混杂因素。比较条件相近的对照组，才能减少把共同变化误当成因果的风险。",
    "hint": "找出同时发生、也可能影响结果的第三个变量。"
  },
  {
    "id": "practice-evid-02",
    "skillCode": "evidence",
    "prompt": "一项问卷只在付费读书社群内发布，报告却写‘所有成年人都热爱阅读’。主要缺陷是什么？",
    "options": [
      {
        "key": "A",
        "label": "价格单位不统一"
      },
      {
        "key": "B",
        "label": "样本选择偏向阅读爱好者，结论不具有总体代表性"
      },
      {
        "key": "C",
        "label": "问卷使用了网络形式"
      },
      {
        "key": "D",
        "label": "样本一定存在重复"
      }
    ],
    "answerKey": "B",
    "explanation": "付费读书社群与成年人总体的阅读偏好不同，选择偏差使外推不可靠。",
    "hint": "先比较样本的获取方式与结论声称覆盖的人群。"
  },
  {
    "id": "practice-evid-03",
    "skillCode": "evidence",
    "prompt": "一个产品实验同时改变了按钮颜色和按钮位置，转化率提升。哪一种结论最谨慎？",
    "options": [
      {
        "key": "A",
        "label": "颜色一定是原因"
      },
      {
        "key": "B",
        "label": "位置一定是原因"
      },
      {
        "key": "C",
        "label": "目前无法单独归因于颜色或位置"
      },
      {
        "key": "D",
        "label": "转化率提升说明两个因素均有效"
      }
    ],
    "answerKey": "C",
    "explanation": "多个变量同时变化，无法辨别单个因素的因果贡献。需要逐项实验或合理的多因素设计。",
    "hint": "检查是否有超过一个变量被同时操作。"
  },
  {
    "id": "practice-evid-04",
    "skillCode": "evidence",
    "prompt": "研究者只观察到 12 位受访者认为新工具省时，便断言‘几乎所有用户都省时’。最主要的问题是什么？",
    "options": [
      {
        "key": "A",
        "label": "12 是偶数"
      },
      {
        "key": "B",
        "label": "缺少有代表性的充分样本与不确定性分析"
      },
      {
        "key": "C",
        "label": "工具一定不省时"
      },
      {
        "key": "D",
        "label": "结论只需要受访者写得更长"
      }
    ],
    "answerKey": "B",
    "explanation": "小而缺乏代表性的样本不能支持对总体的强断言；还需说明不确定性。",
    "hint": "区分‘这批样本中发生了什么’与‘总体一定如何’。"
  },
  {
    "id": "practice-evid-05",
    "skillCode": "evidence",
    "prompt": "一项研究只公布训练效果最好的 5 名参与者，并据此宣称训练对所有人有效。哪项质疑最有力？",
    "options": [
      {
        "key": "A",
        "label": "他们的进步值一定是假的"
      },
      {
        "key": "B",
        "label": "选择性报告成功案例会高估平均效果"
      },
      {
        "key": "C",
        "label": "参加者一定不足 5 人"
      },
      {
        "key": "D",
        "label": "训练周期越短效果越好"
      }
    ],
    "answerKey": "B",
    "explanation": "只保留成功案例会造成幸存者偏差或选择性报告，无法估计总体效应。",
    "hint": "问自己未公布的数据可能是什么。"
  },
  {
    "id": "practice-quant-01",
    "skillCode": "quantitative",
    "prompt": "某设备报警 30 次，其中 18 次确有故障，12 次为误报。报警的阳性预测值是多少？",
    "options": [
      {
        "key": "A",
        "label": "40%"
      },
      {
        "key": "B",
        "label": "60%"
      },
      {
        "key": "C",
        "label": "18%"
      },
      {
        "key": "D",
        "label": "90%"
      }
    ],
    "answerKey": "B",
    "explanation": "阳性预测值=真实故障报警数/全部报警数=18/(18+12)=60%。",
    "hint": "分母应该是‘所有报警’，而非所有设备。"
  },
  {
    "id": "practice-quant-02",
    "skillCode": "quantitative",
    "prompt": "甲组 80 人，其中 48 人达标；乙组 20 人，其中 18 人达标。合计达标率是多少？",
    "options": [
      {
        "key": "A",
        "label": "75%"
      },
      {
        "key": "B",
        "label": "66%"
      },
      {
        "key": "C",
        "label": "90%"
      },
      {
        "key": "D",
        "label": "70%"
      }
    ],
    "answerKey": "B",
    "explanation": "总达标人数 48+18=66，总人数 100，合计 66%。不能简单平均 60% 和 90%。",
    "hint": "合计比例应先相加分子、分母，而不是平均百分比。"
  },
  {
    "id": "practice-quant-03",
    "skillCode": "quantitative",
    "prompt": "一种指标从 40% 上升至 50%。应当如何描述变化？",
    "options": [
      {
        "key": "A",
        "label": "增长 10 个百分点，且相对增长 25%"
      },
      {
        "key": "B",
        "label": "增长 10% 且相对增长 10%"
      },
      {
        "key": "C",
        "label": "增长 25 个百分点"
      },
      {
        "key": "D",
        "label": "相对增长 50%"
      }
    ],
    "answerKey": "A",
    "explanation": "50%-40%=10 个百分点；相对增长=(50-40)/40=25%。",
    "hint": "百分点是相减，相对增幅则用原值作分母。"
  },
  {
    "id": "practice-quant-04",
    "skillCode": "quantitative",
    "prompt": "某渠道的有效转化为 24 人，占到访者的 12%。到访者总人数为多少？",
    "options": [
      {
        "key": "A",
        "label": "120"
      },
      {
        "key": "B",
        "label": "180"
      },
      {
        "key": "C",
        "label": "200"
      },
      {
        "key": "D",
        "label": "288"
      }
    ],
    "answerKey": "C",
    "explanation": "24 ÷ 12%=200。要注意百分比转为小数后再计算。",
    "hint": "已知部分量和占比，用‘部分量÷占比’得到总体。"
  },
  {
    "id": "practice-quant-05",
    "skillCode": "quantitative",
    "prompt": "某项检测的假阳性数为 8，真阳性数为 32。被标为阳性的结果中，假阳性占比是多少？",
    "options": [
      {
        "key": "A",
        "label": "8%"
      },
      {
        "key": "B",
        "label": "20%"
      },
      {
        "key": "C",
        "label": "25%"
      },
      {
        "key": "D",
        "label": "80%"
      }
    ],
    "answerKey": "B",
    "explanation": "被标为阳性的总数=8+32=40，其中假阳性占 8/40=20%。",
    "hint": "先界定条件集合：本题只看被标为阳性的结果。"
  }
] as const;
export function findPracticeItem(itemId:string):PracticeItem|undefined{
 return PRACTICE_BANK.find(item=>item.id===itemId);
}
export function publicPracticeItem(item:PracticeItem){
 return {id:item.id,skillCode:item.skillCode,prompt:item.prompt,options:item.options,
   hint:item.hint,bankVersion:PRACTICE_BANK_VERSION};
}
export type PracticeHistoryEntry={itemId:string;correct:boolean;dayKey:string;createdAt:Date};
/** Choose an unseen practice item first, then a previously incorrect item on a
 * later UTC date; never depend on an assessment answer or expose assessment keys.
 */
export function choosePracticeItem(skillCode:PracticeSkill,history:readonly PracticeHistoryEntry[],
  utcDay:string):PracticeItem|null{
 const items=PRACTICE_BANK.filter(x=>x.skillCode===skillCode);
 const byId=new Map<string,PracticeHistoryEntry[]>();
 for(const entry of history){
  if(!byId.has(entry.itemId))byId.set(entry.itemId,[]);
  byId.get(entry.itemId)!.push(entry);
 }
 const available=items.filter(x=>!(byId.get(x.id)||[]).some(a=>a.dayKey===utcDay));
 available.sort((a,b)=>{
  const aa=byId.get(a.id)||[],bb=byId.get(b.id)||[];
  const ka=aa.length===0?0:aa.some(x=>!x.correct)?1:2;
  const kb=bb.length===0?0:bb.some(x=>!x.correct)?1:2;
  if(ka!==kb)return ka-kb;
  if(aa.length!==bb.length)return aa.length-bb.length;
  const ta=Math.max(0,...aa.map(x=>x.createdAt.getTime()));
  const tb=Math.max(0,...bb.map(x=>x.createdAt.getTime()));
  if(ta!==tb)return ta-tb;
  return a.id.localeCompare(b.id);
 });
 return available[0]??null;
}
