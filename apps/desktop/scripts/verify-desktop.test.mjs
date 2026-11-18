import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
