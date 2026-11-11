import {test} from "node:test";
import assert from "node:assert/strict";
import {validateHabitAnnotation} from "../src/server/habit-ai";
test("AI annotation must quote exact diary evidence and be confident",()=>{
  const note="看到电脑就自然而然打开了笔记，不用再想";
  const good=validateHabitAnnotation({initiationLevel:4,confidence:.9,quote:"自然而然打开了笔记"},
    note,"model-v1");
  assert.equal(good.level,4);
  assert.equal(good.promptVersion,"habit-note-coding-v1");
  assert.equal(validateHabitAnnotation({initiationLevel:4,confidence:.9,quote:"我从不拖延"},
    note,"model-v1").level,null);
  assert.equal(validateHabitAnnotation({initiationLevel:4,confidence:.1,quote:"自然而然打开了笔记"},
    note,"model-v1").level,null);
  assert.equal(validateHabitAnnotation({initiationLevel:null,confidence:0,quote:""},
    note,"model-v1").level,null);
  assert.throws(()=>validateHabitAnnotation({initiationLevel:999,confidence:1,quote:"自然而然打开了笔记"},
    note,"model-v1"));
});
