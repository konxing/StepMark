import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
test("desktop uses bundled local assets with no remote scripts or network-capable webview",()=>{
  const config=JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(config.build.frontendDist,"../ui");
  assert.equal(config.app.security.csp.includes("connect-src 'none'"),true);
  assert.equal(config.bundle.targets.includes("nsis"),true);
  const html=read("ui/index.html");
  assert.match(html,/<script type="module" src="\.\/app\.js"/);
  assert.match(html,/href="\.\/style\.css"/);
  assert.doesNotMatch(html,/https?:\/\/|<iframe|<webview/i);
  const js=readdirSync(new URL("ui/",root))
    .filter(name=>name.endsWith(".js"))
    .map(name=>read(`ui/${name}`))
    .join("\n");
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

test("workbench starters guide the user's own task and preserve drafts and follow-up context",async(t)=>{
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
  const html=read("ui/index.html");
  const nodes=new Map([...html.matchAll(/\sid="([^"]+)"/g)].map(match=>[match[1],new Element()]));
  const starters=[...html.matchAll(/\sdata-starter="([^"]+)"/g)].map(([,prompt])=>{
    const button=new Element();button.dataset.starter=prompt;return button;
  });
  assert.equal(starters.length,3);
  assert.doesNotMatch(html,/data-example|view-retest|等价无穷小|交换机管理口/);
  const calls=[];
  const result={analysis:"One conditional finding",deliverable:"A reusable draft",nextStep:"Check the next observation"};
  let shouldFail=true;
  let copied;
  const invoke=async(command,args)=>{
    if(command==="deepseek_status")return {configured:true,savedHere:true};
    if(command==="get_status")return {signedIn:false,apiOrigin:"https://stepmark.xin"};
    if(command==="work_on_problem"){
      calls.push(structuredClone(args));
      if(shouldFail)throw "DeepSeek connection failed";
      return result;
    }
    throw Error("Unexpected command: "+command);
  };
  const document={getElementById:id=>nodes.get(id),querySelectorAll:selector=>selector==="[data-starter]"?starters:[],createElement:()=>new Element()};
  const navigator={clipboard:{writeText:async value=>{copied=value;}}};
  const globals = {document, navigator, window: {__TAURI__: {core: {invoke}}}};
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  await import(new URL("ui/app.js", root));
  await new Promise(resolve=>setImmediate(resolve));
  const input=nodes.get("question");
  const submit=()=>nodes.get("composer").events.submit({preventDefault(){}});
  starters[0].events.click();
  assert.equal(input.value,"");
  assert.equal(input.placeholder,starters[0].dataset.starter);
  await submit();
  assert.equal(calls.length,0);
  input.value="Investigate why the result changed";
  starters[2].events.click();
  assert.equal(input.placeholder,starters[2].dataset.starter);
  assert.equal(input.value,"Investigate why the result changed");
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

test("the Windows preview uses the local account server and keeps DeepSeek separate",()=>{
  const workflow=read("../../.github/workflows/desktop-windows.yml");
  assert.match(workflow,/STEPMARK_API_ORIGIN: http:\/\/127\.0\.0\.1:8080/);
  assert.match(workflow,/Build unsigned Windows NSIS preview installer/);
  assert.match(workflow,/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/inputs\.api_origin|stepmark\.xin/);
  const native=read("src-tauri/src/lib.rs");
  assert.match(native,/const LOCAL_ORIGIN: &str = "http:\/\/127\.0\.0\.1:8080"/);
  assert.match(native,/session-local-8080/);
  const probe=read("scripts/check-deployment.mjs");
  assert.match(probe,/const origin="https:\/\/stepmark\.xin"/);
  assert.match(probe,/UNAUTHENTICATED/);
  assert.doesNotMatch(probe,/authorization|cookie/i);
});
