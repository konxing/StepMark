import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
test("desktop uses bundled local assets with no remote scripts or network-capable webview",()=>{
  const config=JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(config.build.frontendDist,"../ui");
  assert.equal(config.app.security.csp.includes("connect-src 'none'"),true);
  assert.equal(config.bundle.targets.includes("nsis"),true);
  const html=read("ui/index.html");
  assert.match(html,/src="\.\/app\.js"/);
  assert.match(html,/href="\.\/style\.css"/);
  assert.doesNotMatch(html,/https?:\/\/|<iframe|<webview/i);
  const js=read("ui/app.js");
  for(const banned of [/localStorage/,/sessionStorage/,/document\.cookie/,/innerHTML/,/\bfetch\s*\(/,/\beval\s*\(/,/Authorization\s*:/]){
    assert.doesNotMatch(js,banned);
  }
  const capability=JSON.parse(read("src-tauri/capabilities/default.json"));
  assert.deepEqual(capability.permissions,["core:default"]);
});
test("native commands do not expose a session token to the webview",()=>{
  const rust=read("src-tauri/src/lib.rs");
  assert.match(rust,/fn credential\(/);
  assert.match(rust,/set_password\(/);
  assert.match(rust,/fn get_habits\(/);
  assert.match(rust,/fn sign_out\(/);
  assert.doesNotMatch(rust,/tauri_plugin_shell|tauri_plugin_http|window\.eval/);
});

test("workbench keeps a failed draft, carries context, and opens an offline retest",async()=>{
  class Element {
    constructor(){
      this.children=[];this.dataset={};this.events={};this.value="";this.textContent="";
      this.classList={toggle(){}};
    }
    addEventListener(name,handler){this.events[name]=handler;}
    setAttribute(){} removeAttribute(){} focus(){} scrollIntoView(){}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
  }
  const nodes=new Map([...read("ui/index.html").matchAll(/\sid="([^"]+)"/g)].map(match=>[match[1],new Element()]));
  const calls=[];
  const result={analysis:"One conditional finding",deliverable:"A reusable draft",nextStep:"Check the next observation",retestTopic:"evidence"};
  let shouldFail=true;
  let copied;
  const invoke=async(command,args)=>{
    if(command==="deepseek_status")return {configured:true,savedHere:true};
    if(command==="get_status")return {signedIn:false,apiOrigin:"https://stepmark.xin"};
    if(command==="get_retest"){
      assert.equal(args.topic,"evidence");
      return {question:{id:"evidence-v1-confound",prompt:"Which statement is supported?",options:["A","B","C"]},attempts:[],nextAt:null,total:3};
    }
    if(command==="submit_retest"){
      assert.equal(args.topic,"evidence");
      assert.equal(args.id,"evidence-v1-confound");
      assert.equal(args.choice,1);
      return {question:null,attempts:[{attempt:{itemId:args.id,choice:1,recordedAt:1000},correct:true,
        answer:1,explanation:"Compare the conditions."}],nextAt:86401000,total:3};
    }
    if(command==="work_on_problem"){
      calls.push(structuredClone(args));
      if(shouldFail)throw "DeepSeek connection failed";
      return result;
    }
    throw Error("Unexpected command: "+command);
  };
  const document={getElementById:id=>nodes.get(id),querySelectorAll:()=>[],createElement:()=>new Element()};
  const navigator={clipboard:{writeText:async value=>{copied=value;}}};
  runInNewContext(read("ui/app.js"),{document,navigator,window:{__TAURI__:{core:{invoke}}}});
  await new Promise(resolve=>setImmediate(resolve));
  const input=nodes.get("question");
  const submit=()=>nodes.get("composer").events.submit({preventDefault(){}});
  input.value="Investigate why the result changed";
  await submit();
  assert.equal(input.value,"Investigate why the result changed");
  assert.equal(nodes.get("work-status").dataset.error,"true");
  shouldFail=false;
  await submit();
  assert.equal(input.value,"");
  assert.equal(nodes.get("welcome").hidden,true);
  const turn=nodes.get("conversation").children[0];
  const output=turn.children[1].children[2];
  assert.equal(output.children[1].textContent,result.deliverable);
  output.children[0].children[1].events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(copied,result.deliverable);
  turn.children[1].children.at(-1).events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.get("retest-form").hidden,false);
  assert.equal(nodes.get("retest-submit").disabled,true);
  assert.equal(nodes.get("retest-feedback").hidden,true);
  nodes.get("retest-options").children[1].children[0].events.change();
  await nodes.get("retest-form").events.submit({preventDefault(){}});
  assert.equal(nodes.get("retest-form").hidden,true);
  assert.equal(nodes.get("retest-feedback").children[1].textContent,"Compare the conditions.");
  assert.equal(nodes.get("retest-attempts").children.length,1);
  assert.equal(nodes.get("retest-refresh").hidden,false);
  input.value="I tested it and got new evidence";
  await submit();
  assert.deepEqual(calls.at(-1).history,[{question:"Investigate why the result changed",result}]);
});

test("DeepSeek is pinned to the official Flash endpoint, with a separate native credential",()=>{
  const native=read("src-tauri/src/ai_workspace.rs");
  assert.match(native,/const ENDPOINT: &str = "https:\/\/api\.deepseek\.com\/chat\/completions";/);
  assert.match(native,/const MODEL: &str = "deepseek-flash";/);
  assert.match(native,/const ACCOUNT: &str = "deepseek-workspace";/);
  assert.match(native,/reqwest::redirect::Policy::none\(\)/);
  assert.match(native,/verify_key\(key\)\.await\?;\s*credential\(\)\?\.set_password\(key\)/);
});

test("installer is pinned to the owner's canonical HTTPS domain",()=>{
  const workflow=read("../../.github/workflows/desktop-windows.yml");
  assert.match(workflow,/STEPMARK_API_ORIGIN: https:\/\/stepmark\.xin/);
  assert.match(workflow,/Build unsigned Windows NSIS preview installer/);
  assert.match(workflow,/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/inputs\.api_origin|http:\/\/stepmark\.xin/);
  const probe=read("scripts/check-deployment.mjs");
  assert.match(probe,/const origin="https:\/\/stepmark\.xin"/);
  assert.match(probe,/UNAUTHENTICATED/);
  assert.doesNotMatch(probe,/authorization|cookie/i);
});
