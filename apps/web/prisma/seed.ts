import {PrismaClient} from "../src/generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL required");
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2,connectionTimeoutMillis:3000})});
const tasks=[
  {
    id:"e085074f-728a-4e6a-84e6-159a5db11e01",
    prompt:"只有通过权限校验才能读取私人记录。甲已经读取了一份私人记录。以下哪项必然成立？",
    options:[
      {key:"A",label:"甲已通过权限校验"},
      {key:"B",label:"甲拥有管理员身份"},
      {key:"C",label:"甲读取了所有记录"},
      {key:"D",label:"无法判断是否通过权限校验"}
    ],
    correctKey:"A",explanation:"“只有通过权限校验才能读取”表示通过校验是读取的必要条件。能够读取意味着必要条件已满足。"
  },
  {
    id:"e085074f-728a-4e6a-84e6-159a5db11e02",
    prompt:"如果数据通过完整性校验，它就会被准许入库。某条数据已经获准入库，以下判断哪一个符合逻辑？",
    options:[
      {key:"A",label:"这条数据必定通过完整性校验"},
      {key:"B",label:"不能仅据此推出它通过了完整性校验"},
      {key:"C",label:"这条数据必定未通过完整性校验"},
      {key:"D",label:"所有没有入库的数据都通过了校验"}
    ],
    correctKey:"B",explanation:"从 P 推出 Q，并不能反过来由 Q 必然推出 P。这是典型的肯定后件谬误。"
  },
  {
    id:"e085074f-728a-4e6a-84e6-159a5db11e03",
    prompt:"已知“如果 A 发生则 B 发生”和“如果 B 发生则 C 发生”，并已知 A 发生。下面哪项必然成立？",
    options:[
      {key:"A",label:"C 不发生"},
      {key:"B",label:"B 不发生"},
      {key:"C",label:"C 发生"},
      {key:"D",label:"无法判断 B 是否发生"}
    ],
    correctKey:"C",explanation:"由 A→B 与 A 可得 B，再由 B→C 与 B 可得 C，属于蕴涵关系的传递与肯定前件。"
  },
  {
    id:"e085074f-728a-4e6a-84e6-159a5db11e04",
    prompt:"四位选手的速度互不相同。A 比 B 快，B 比 C 快，D 比 A 慢但比 B 快。由快到慢的顺序是什么？",
    options:[
      {key:"A",label:"D、A、B、C"},
      {key:"B",label:"A、B、D、C"},
      {key:"C",label:"A、D、B、C"},
      {key:"D",label:"B、A、D、C"}
    ],
    correctKey:"C",explanation:"综合 A>B>C 和 A>D>B，可推出 A>D>B>C。"
  }
];
const newForms=[
  {
    "id": "fbc10800-0000-4000-8000-000000000101",
    "formCode": "logic-a-v1",
    "formOrder": 1,
    "skillCode": "conditional",
    "prompt": "只有获得数据访问授权，才能下载受限档案。小王已经下载了一份受限档案。以下哪项必然正确？",
    "options": [
      {
        "key": "A",
        "label": "小王已经获得访问授权"
      },
      {
        "key": "B",
        "label": "小王拥有所有档案的授权"
      },
      {
        "key": "C",
        "label": "小王是管理员"
      },
      {
        "key": "D",
        "label": "小王从未申请授权"
      }
    ],
    "correctKey": "A",
    "explanation": "“只有授权才可下载”表示授权是下载的必要条件。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000102",
    "formCode": "logic-a-v1",
    "formOrder": 2,
    "skillCode": "conditional",
    "prompt": "如果备份校验成功，系统就会生成校验报告。今天没有生成校验报告。以下必然成立的是？",
    "options": [
      {
        "key": "A",
        "label": "备份校验已经成功"
      },
      {
        "key": "B",
        "label": "备份校验没有成功"
      },
      {
        "key": "C",
        "label": "系统一定发生硬件故障"
      },
      {
        "key": "D",
        "label": "没有进行任何备份"
      }
    ],
    "correctKey": "B",
    "explanation": "由“校验成功→生成报告”和“未生成报告”，可用否定后件推得未校验成功；无法推出具体原因。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000103",
    "formCode": "logic-a-v1",
    "formOrder": 3,
    "skillCode": "evidence",
    "prompt": "某班使用新学习软件后平均成绩提高，但同时课程难度下降。哪项设计最有助于判断软件本身的作用？",
    "options": [
      {
        "key": "A",
        "label": "仅询问使用者是否喜欢软件"
      },
      {
        "key": "B",
        "label": "比较随机分组且课程难度相同的使用组与对照组"
      },
      {
        "key": "C",
        "label": "只公布提高最多的学生"
      },
      {
        "key": "D",
        "label": "把成绩提高全部归因于软件"
      }
    ],
    "correctKey": "B",
    "explanation": "随机分组并控制课程难度，有助于区分软件作用与共同变化的干扰因素。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000104",
    "formCode": "logic-a-v1",
    "formOrder": 4,
    "skillCode": "evidence",
    "prompt": "调查者只访问健身房会员，却声称“这座城市绝大多数居民每周锻炼五次”。最直接的问题是什么？",
    "options": [
      {
        "key": "A",
        "label": "回答人数一定太少"
      },
      {
        "key": "B",
        "label": "抽样框偏向经常锻炼者，难代表全市"
      },
      {
        "key": "C",
        "label": "调查结果只能使用整数"
      },
      {
        "key": "D",
        "label": "每周五次必然不可能"
      }
    ],
    "correctKey": "B",
    "explanation": "只访问健身房会员会产生选择偏差，样本不具有全市代表性。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000105",
    "formCode": "logic-a-v1",
    "formOrder": 5,
    "skillCode": "quantitative",
    "prompt": "审核了100条记录，其中实际异常20条。系统标记了15条异常和5条正常记录。被系统标记的记录中，实际异常占比是多少？",
    "options": [
      {
        "key": "A",
        "label": "15%"
      },
      {
        "key": "B",
        "label": "20%"
      },
      {
        "key": "C",
        "label": "75%"
      },
      {
        "key": "D",
        "label": "95%"
      }
    ],
    "correctKey": "C",
    "explanation": "被标记的总数为15+5=20，其中15条异常，条件比例为15/20=75%。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000106",
    "formCode": "logic-a-v1",
    "formOrder": 6,
    "skillCode": "quantitative",
    "prompt": "甲组40次有效机会完成30次，乙组10次有效机会完成5次。两组合计的完成率是多少？",
    "options": [
      {
        "key": "A",
        "label": "60%"
      },
      {
        "key": "B",
        "label": "70%"
      },
      {
        "key": "C",
        "label": "75%"
      },
      {
        "key": "D",
        "label": "80%"
      }
    ],
    "correctKey": "B",
    "explanation": "总完成次数35，总机会50，合计率为35/50=70%；不能简单平均两组百分比。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000201",
    "formCode": "logic-b-v1",
    "formOrder": 1,
    "skillCode": "conditional",
    "prompt": "只有启用双因素验证，账户才允许执行资金审批。一个账户已经执行了资金审批。以下必然正确的是？",
    "options": [
      {
        "key": "A",
        "label": "它启用了双因素验证"
      },
      {
        "key": "B",
        "label": "它从不需要密码"
      },
      {
        "key": "C",
        "label": "它是唯一审批账户"
      },
      {
        "key": "D",
        "label": "它的全部审批都正确"
      }
    ],
    "correctKey": "A",
    "explanation": "双因素验证是资金审批的必要条件，执行审批意味着满足该条件。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000202",
    "formCode": "logic-b-v1",
    "formOrder": 2,
    "skillCode": "conditional",
    "prompt": "若服务节点拥有有效证书，它就能加入可信节点列表。某节点没有加入该列表。以下必然正确的是？",
    "options": [
      {
        "key": "A",
        "label": "它拥有有效证书"
      },
      {
        "key": "B",
        "label": "它不拥有有效证书"
      },
      {
        "key": "C",
        "label": "它的网络一定中断"
      },
      {
        "key": "D",
        "label": "它从未尝试加入"
      }
    ],
    "correctKey": "B",
    "explanation": "条件命题“有效证书→加入列表”的逆否命题为“未加入→没有有效证书”；其他原因不能必然推断。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000203",
    "formCode": "logic-b-v1",
    "formOrder": 3,
    "skillCode": "evidence",
    "prompt": "一个小组训练后测验分数更高，但训练前未测量各组水平。怎样更有力地评估训练的实际效果？",
    "options": [
      {
        "key": "A",
        "label": "只公布训练组的最高成绩"
      },
      {
        "key": "B",
        "label": "在相近条件下随机分配并比较两组前后变化"
      },
      {
        "key": "C",
        "label": "让训练组自己评价进步幅度"
      },
      {
        "key": "D",
        "label": "删除成绩没有提高的成员"
      }
    ],
    "correctKey": "B",
    "explanation": "随机分配并比较两组的前后变化，可以减弱起点差异和其他混杂的影响。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000204",
    "formCode": "logic-b-v1",
    "formOrder": 4,
    "skillCode": "evidence",
    "prompt": "某研究只调查信息学院学生的阅读习惯，然后推断全校所有学生都偏好同一种书籍。最关键的推理缺陷是什么？",
    "options": [
      {
        "key": "A",
        "label": "问卷没有采用纸质形式"
      },
      {
        "key": "B",
        "label": "样本范围单一，结论推广缺乏代表性"
      },
      {
        "key": "C",
        "label": "每人只能填写一次问卷"
      },
      {
        "key": "D",
        "label": "无法根据问卷计算平均值"
      }
    ],
    "correctKey": "B",
    "explanation": "样本来自单一学院，不能在未经额外验证时推广到全校。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000205",
    "formCode": "logic-b-v1",
    "formOrder": 5,
    "skillCode": "quantitative",
    "prompt": "检测了200件零件，其中20件实际有缺陷。检测器标记出16件有缺陷零件和24件正常零件。被标记零件的实际缺陷占比是多少？",
    "options": [
      {
        "key": "A",
        "label": "8%"
      },
      {
        "key": "B",
        "label": "16%"
      },
      {
        "key": "C",
        "label": "40%"
      },
      {
        "key": "D",
        "label": "80%"
      }
    ],
    "correctKey": "C",
    "explanation": "一共标记16+24=40件，其中16件有缺陷，所以比例为16/40=40%。"
  },
  {
    "id": "fbc10800-0000-4000-8000-000000000206",
    "formCode": "logic-b-v1",
    "formOrder": 6,
    "skillCode": "quantitative",
    "prompt": "甲组30次尝试成功24次，乙组20次尝试成功12次。两组合计成功率是多少？",
    "options": [
      {
        "key": "A",
        "label": "68%"
      },
      {
        "key": "B",
        "label": "70%"
      },
      {
        "key": "C",
        "label": "72%"
      },
      {
        "key": "D",
        "label": "80%"
      }
    ],
    "correctKey": "C",
    "explanation": "总成功36次，总尝试50次，合计成功率36/50=72%。"
  }
];
async function main(){
  await db.construct.upsert({where:{code:"reasoning.logic"},update:{},create:{
    code:"reasoning.logic",title:"逻辑推理",version:"0.1.0",
    metadata:{status:"experimental",norms:false,description:"原创演示题，未校准"} as object
  }});
  for(const t of tasks){
    await db.task.upsert({where:{id:t.id},update:{},create:{
      id:t.id,constructCode:"reasoning.logic",version:"demo-1",
      content:{kind:"single_choice_v1",prompt:t.prompt,options:t.options,correctKey:t.correctKey,explanation:t.explanation},
      publishedAt:new Date("2026-11-10T00:00:00Z")
    }});
  }
  for(const t of newForms){
    await db.task.upsert({where:{id:t.id},update:{},create:{
      id:t.id,constructCode:"reasoning.logic",version:"logic-form-1",
      formCode:t.formCode,skillCode:t.skillCode,formOrder:t.formOrder,
      content:{kind:"single_choice_v1",prompt:t.prompt,options:t.options,
        correctKey:t.correctKey,explanation:t.explanation},
      publishedAt:new Date("2026-11-11T00:00:00Z")
    }});
  }
  process.stdout.write("Seeded demo tasks and two independent uncalibrated reasoning forms.\n");
}
main().finally(()=>db.$disconnect()).catch(err=>{process.stderr.write("Seed failed\n");process.exitCode=1;});
