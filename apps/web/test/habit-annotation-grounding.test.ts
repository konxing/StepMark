import {test} from "node:test";
import assert from "node:assert/strict";
import {habitExamples} from "../scripts/measurement-cases";
import {validateHabitAnnotation} from "../src/server/habit-ai";

const proposal=(initiationLevel:number,quote:string)=>({initiationLevel,quote,confidence:0.99});

test("faulty high-confidence model labels cannot turn eight non-initiation descriptions into ratings",()=>{
  for(const example of habitExamples){
    const annotation=validateHabitAnnotation(proposal(example.expected??4,example.note),example.note,"fixture-model");
    assert.equal(annotation.level,example.expected,example.id);
    assert.equal(annotation.promptVersion,"habit-note-coding-v2");
    if(example.expected===null)assert.equal(annotation.quote,null);
  }
});

test("exact quotations still require ownership, actual initiation and a supported level",()=>{
  const rejected:[string,string,number][]=[
    ["今天完成了阅读十页。","完成了阅读十页",4],
    ["我并不是不用思考就开始阅读。","不用思考就开始阅读",4],
    ["同事说他看到提示就下意识开始阅读。","看到提示就下意识开始阅读",4],
    ["书中写着：“看到提示就下意识开始阅读”。","看到提示就下意识开始阅读",4],
    ["如果看到提示就下意识开始阅读，会怎样？","看到提示就下意识开始阅读",4],
    ["我看到提示就下意识开始阅读了吗？","看到提示就下意识开始阅读",4],
    ["我需要强迫自己才开始阅读。","强迫自己才开始阅读",4],
    ["我很自然地开始阅读。","很自然地开始阅读",4],
    ["我没有很自然地开始阅读。","很自然地开始阅读",3],
    ["我不自然地开始阅读。","我不自然地开始阅读",3],
    ["我不太自然地开始阅读，还需要强迫自己。","我不太自然地开始阅读，还需要强迫自己。",3],
    ["我不是没有思考就开始阅读。","没有思考就开始阅读",4],
    ["明天看到书，我就会下意识开始阅读。","我就会下意识开始阅读",4],
    ["他一看到书，便下意识开始阅读。","便下意识开始阅读",4],
    ["我读到“看到提示就下意识开始阅读”这句话。","我读到“看到提示就下意识开始阅读”这句话",4],
    ["我下意识开始阅读了。我下意识开始阅读了。","我下意识开始阅读了",4]
  ];
  for(const [note,quote,level] of rejected){
    assert.equal(validateHabitAnnotation(proposal(level,quote),note,"fixture").level,null,note);
  }
});

test("actual own evidence survives unrelated future plans or another person's separate sentence",()=>{
  for(const note of [
    "明天我打算再读十页。今天我看到提示就下意识开始阅读了。",
    "同事说他需要反复提醒。今天我看到提示就下意识开始阅读了。"
  ])assert.equal(validateHabitAnnotation(proposal(4,"看到提示就下意识开始阅读"),note,"fixture").level,4);
  const note="我并不是不用思考就开始，每次开始前仍要反复纠结好久。";
  assert.equal(validateHabitAnnotation(proposal(1,"每次开始前仍要反复纠结好久"),note,"fixture").level,1);
  const natural="我没有犹豫就很自然地开始阅读。";
  assert.equal(validateHabitAnnotation(proposal(3,natural),natural,"fixture").level,3);
  const separate="我看到提示就下意识开始阅读了。明天我希望再读十页。";
  assert.equal(validateHabitAnnotation(proposal(4,"我看到提示就下意识开始阅读了。"),separate,"fixture").level,4);
});
