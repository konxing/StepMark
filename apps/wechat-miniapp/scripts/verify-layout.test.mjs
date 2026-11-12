/**
 * Structural mini-program render contract tests. These are NOT a substitute for
 * WeChat Developer Tools or screenshots from actual mobile devices.
 */
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import assert from "node:assert/strict";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const wxml=readFileSync(resolve(root,"pages/index/index.wxml"),"utf8");
const wxss=readFileSync(resolve(root,"pages/index/index.wxss"),"utf8");
const logic=readFileSync(resolve(root,"pages/index/index.js"),"utf8");
const app=JSON.parse(readFileSync(resolve(root,"app.json"),"utf8"));

function structuralTags(src){
  const stack=[],found=new Map();
  const voids=new Set(["input","radio","switch","image","icon","checkbox","progress"]);
  for(let i=0;i<src.length;){
    const pos=src.indexOf("<",i);if(pos<0)break;
    if(src.startsWith("<!--",pos)){
      const finish=src.indexOf("-->",pos+4);assert.ok(finish>pos,"unterminated WXML comment");
      i=finish+3;continue;
    }
    let end=pos+1,quote=null;
    for(;end<src.length;end++){
      const char=src[end];
      if(quote){if(char===quote)quote=null;}
      else if(char==='"'||char==="'")quote=char;
      else if(char===">")break;
    }
    assert.ok(end<src.length,"unterminated WXML tag");
    const body=src.slice(pos+1,end).trim();
    i=end+1;
    if(body.startsWith("!")||body.startsWith("?"))continue;
    const closing=body.startsWith("/");
    const match=body.match(/^\/?([a-z][a-z0-9-]*)\b/i);
    assert.ok(match,"malformed WXML tag "+body.slice(0,28));
    const name=match[1];
    found.set(name,(found.get(name)||0)+1);
    if(voids.has(name)||body.endsWith("/"))continue;
    if(closing)assert.equal(stack.pop(),name,"mismatched WXML "+name);
    else stack.push(name);
  }
  assert.deepEqual(stack,[],"unclosed WXML tags");
  return found;
}
test("mobile WXML has balanced containers and a safe chat data contract",()=>{
  const tags=structuralTags(wxml);
  assert.ok(tags.get("scroll-view")>=2,"chat and practice scroll need bounded view");
  for(const key of ["chatMessages","chatInput","chatConsent","chatBusy","chatBottomId",
    "modules","dueReviews","progress","recentReflections","showAdvanced"]){
    assert.ok(wxml.includes(key),"missing visible "+key);
    assert.ok(logic.includes(key),"missing JS binding "+key);
  }
  assert.match(wxml,/bindtap="sendChat"/);
  assert.match(wxml,/bindchange="onChatConsent"/);
  assert.match(wxml,/wx:if="{{showAdvanced}}"/);
  assert.match(logic,/\/api\/v1\/assistant/);
});
test("small-phone layout has width constraints and bottom safe-area protection",()=>{
  assert.match(wxss,/safe-area-inset-bottom/);
  assert.match(wxss,/max-width:\s*100vw/);
  assert.match(wxss,/overflow-x:\s*hidden/);
  assert.match(wxss,/\.chat-feed\s*\{[^}]*height:/s);
  assert.match(wxss,/\.chat-textarea\s*\{[^}]*min-width:\s*0/s);
  assert.match(wxss,/\.chat-bubble\s*\{[^}]*overflow-wrap:/s);
  assert.ok(app.pages.includes("pages/index/index"));
});
test("mobile request methods are limited to methods supported by wx.request",()=>{
  const literalMethods=[...logic.matchAll(/this\.api\([^\n]*?,"(GET|POST|PUT|DELETE|PATCH)"/g)].map(x=>x[1]);
  assert.ok(!literalMethods.includes("PATCH"));
  assert.match(logic,/chatBusy/);
  assert.match(logic,/chatConsent/);
});
