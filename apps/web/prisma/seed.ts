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
  process.stdout.write("Seeded original experimental reasoning tasks.\n");
}
main().finally(()=>db.$disconnect()).catch(err=>{process.stderr.write("Seed failed\n");process.exitCode=1;});
