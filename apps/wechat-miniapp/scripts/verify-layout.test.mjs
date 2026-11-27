/**
 * Structural mini-program render contract tests. These are NOT a substitute for
 * WeChat Developer Tools or screenshots from actual mobile devices.
 */
import {readdirSync,readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import assert from "node:assert/strict";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const wxml=readFileSync(resolve(root,"pages/index/index.wxml"),"utf8");
const wxss=readFileSync(resolve(root,"pages/index/index.wxss"),"utf8");
const pageDir=resolve(root,"pages/index");
const entry=resolve(pageDir,"index.js");
const logic=readdirSync(pageDir)
  .filter(name=>name.endsWith(".js"))
  .map(name=>readFileSync(resolve(pageDir,name),"utf8"))
  .join("\n");
let page;
runInNewContext(readFileSync(entry,"utf8"),{
  require:createRequire(entry),
  Page(definition){page=definition;}
});
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
  assert.ok(tags.get("scroll-view")>=1,"chat scroll needs a bounded view");
  for(const key of ["chatMessages","chatInput","chatConsent","chatBusy","chatBottomId",
    "modules","dueReviews","progress","recentReflections","showAdvanced"]){
    assert.ok(wxml.includes(key),"missing visible "+key);
    assert.ok(Object.hasOwn(page.data,key),"missing JS state "+key);
  }
  for(const [,handler] of wxml.matchAll(/\b(?:bind|catch)[a-z]+="([A-Za-z_]\w*)"/g)){
    assert.equal(typeof page[handler],"function","missing JS handler "+handler);
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
  const literalMethods=[...logic.matchAll(/this\.api\([^,]+,\s*"(GET|POST|PUT|DELETE|PATCH)"/g)].map(x=>x[1]);
  assert.ok(literalMethods.length>0);
  assert.ok(!literalMethods.includes("PATCH"));
  assert.match(logic,/chatBusy/);
  assert.match(logic,/chatConsent/);
});

test("configured chat requires explicit consent and remembers preferences only for the same account", async () => {
  const key = "stepmark_mobile_access";
  const storage = new Map([[key, "mock-token"]]);
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const requests = [];
  globalThis.wx = {
    getStorageSync(name) { return storage.get(name); },
    setStorageSync(name, value) { storage.set(name, value); }
  };
  globalThis.getApp = () => ({ globalData: { apiBase: "https://stepmark.xin" } });

  function openChat(userId, configured = true) {
    return {
      ...page,
      data: { ...structuredClone(page.data), authenticated: true, chatInput: "今天读完五页" },
      setData(update) { Object.assign(this.data, update); },
      async api(path, method, data) {
        assert.equal(path, "/api/v1/assistant");
        requests.push({ method, data });
        if (method === "GET") return { configured, userId };
        return { reply: "已收到。" };
      }
    };
  }

  try {
    const first = openChat("account-a");
    await first.loadChatAvailability();
    assert.equal(first.data.chatAvailability, "ready");
    assert.equal(first.data.chatConsent, false);
    await first.sendChat();
    assert.deepEqual(requests, [{ method: "GET", data: undefined }]);

    first.onChatConsent({ detail: { value: true } });
    first.onGrowthEvidenceConsent({ detail: { value: false } });
    assert.equal(requests.length, 1, "changing authorization must not send a draft");
    await first.sendChat();
    assert.equal(requests.at(-1).method, "POST");
    assert.equal(requests.at(-1).data.consentToAI, true);
    assert.equal(requests.at(-1).data.consentUserId, "account-a");
    assert.equal(requests.at(-1).data.recordGrowthEvidence, false);

    const reopened = openChat("account-a");
    await reopened.loadChatAvailability();
    assert.equal(reopened.data.chatConsent, true);
    assert.equal(reopened.data.recordGrowthEvidence, false);

    const differentAccount = openChat("account-b");
    await differentAccount.loadChatAvailability();
    assert.equal(differentAccount.data.chatConsent, false);
    assert.equal(differentAccount.data.recordGrowthEvidence, true);
    await differentAccount.sendChat();
    assert.equal(requests.at(-1).method, "GET");

    const unconfigured = openChat("account-a", false);
    await unconfigured.loadChatAvailability();
    assert.equal(unconfigured.data.chatAvailability, "unconfigured");
    assert.equal(unconfigured.data.chatConsent, true);
    await unconfigured.sendChat();
    assert.equal(requests.at(-1).method, "GET");
    unconfigured.onChatConsent({ detail: { value: false } });

    const revoked = openChat("account-a");
    await revoked.loadChatAvailability();
    assert.equal(revoked.data.chatConsent, false);
    assert.equal(revoked.data.recordGrowthEvidence, false);
    await revoked.sendChat();
    assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
  } finally {
    globalThis.wx = originalWx;
    globalThis.getApp = originalGetApp;
  }
});
