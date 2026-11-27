import {test} from "node:test";
import assert from "node:assert/strict";
import {summarizeChatAutomaticity,type ChatInitiationRow} from "../src/server/chat-automaticity";

const row=(day:string,level:number,note:string,quote:string):ChatInitiationRow=>({
  note,aiQuote:quote,aiLevel:level,event:{occurredAt:new Date(day+"T12:00:00Z"),opportunityKey:"daily:"+day}
});
const now=Date.parse("2026-11-28T12:00:00Z");
test("chat signal preserves ordinal median range, one entry per dated execution day",()=>{
  const a=row("2026-11-24",4,"我开始时完全不用思考","完全不用思考");
  const b=row("2026-11-25",2,"我开始时有一点纠结","有一点纠结");
  const result=summarizeChatAutomaticity([a,a,b],now);
  assert.equal(result?.days,2);
  assert.equal(result?.medianLow,2);
  assert.equal(result?.medianHigh,4);
  assert.equal(result?.stale,false);
});
test("missing event, fabricated quote, negation, conditional and future date cannot yield a signal",()=>{
  const valid=row("2026-11-24",4,"我开始时完全不用思考","完全不用思考");
  assert.equal(summarizeChatAutomaticity([
    {...valid,event:null},{...valid,aiQuote:"invented"},
    row("2026-11-24",4,"我开始时并不是不用思考","不用思考"),
    row("2026-11-24",4,"如果我开始时完全不用思考","完全不用思考"),
    row("2026-11-29",4,"我开始时完全不用思考","完全不用思考")
  ],now),null);
});
test("silence changes freshness, not the ordinal observation",()=>{
  const old=row("2026-09-01",4,"我开始时完全不用思考","完全不用思考");
  const result=summarizeChatAutomaticity([old],now);
  assert.equal(result?.medianLow,4);
  assert.equal(result?.stale,true);
});
