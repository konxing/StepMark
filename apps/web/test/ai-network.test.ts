import {test} from "node:test";
import assert from "node:assert/strict";
import {proxyEnvironment,safeAiErrorCode,windowsHttpsProxy} from "../src/server/ai-network";
import {aiErrorMessage} from "../src/lib/ai-errors";

test("Windows shared and per-protocol proxies select the HTTPS server",()=>{
  assert.equal(windowsHttpsProxy("127.0.0.1:7897"),"http://127.0.0.1:7897/");
  assert.equal(windowsHttpsProxy("http=127.0.0.1:80;https=127.0.0.1:7897"),"http://127.0.0.1:7897/");
  assert.equal(windowsHttpsProxy("http=127.0.0.1:80"),undefined);
  assert.equal(windowsHttpsProxy("https://proxy.example.com:8443"),"https://proxy.example.com:8443/");
  for(const raw of ["socks5://127.0.0.1:7897","http://proxy.example.com/a","http://proxy.example.com/?key=x"]){
    assert.throws(()=>windowsHttpsProxy(raw),/AI_PROXY_INVALID/);
  }
});

test("explicit proxy wins, opt-out works and loopback bypasses the proxy",()=>{
  const config=proxyEnvironment({HTTPS_PROXY:"http://explicit.example.com:8123",NO_PROXY:".internal"},"127.0.0.1:7897");
  assert.equal(config.mode,"environment_proxy");
  assert.equal(config.proxy?.HTTPS_PROXY,"http://explicit.example.com:8123/");
  assert.equal(config.proxy?.NO_PROXY,".internal,localhost,127.0.0.1,::1");
  assert.equal(proxyEnvironment({https_proxy:"http://lower.example.com",HTTPS_PROXY:"http://upper.example.com"}).proxy?.HTTPS_PROXY,
    "http://lower.example.com/");
  assert.deepEqual(proxyEnvironment({STEPMARK_USE_SYSTEM_PROXY:"0"},"127.0.0.1:7897"),{mode:"direct"});
  assert.deepEqual(proxyEnvironment({HTTPS_PROXY:""},"127.0.0.1:7897"),{mode:"direct"});
  assert.deepEqual(proxyEnvironment({}),{mode:"direct"});
});

test("network diagnostics expose fixed categories and discard private details",()=>{
  for(const [code,expected] of [
    ["ENOTFOUND","AI_DNS_FAILED"],["EAI_AGAIN","AI_DNS_FAILED"],
    ["EACCES","AI_NETWORK_BLOCKED"],["ECONNREFUSED","AI_CONNECTION_REFUSED"],
    ["CERT_HAS_EXPIRED","AI_TLS_FAILED"],["UND_ERR_HEADERS_TIMEOUT","AI_TIMEOUT"]
  ]){
    const error=new Error("private host and secret",{cause:Object.assign(new Error("private cause"),{code})});
    assert.equal(safeAiErrorCode(error),expected);
    assert.ok(aiErrorMessage(safeAiErrorCode(error)));
    assert.ok(!aiErrorMessage(safeAiErrorCode(error))?.includes("private"));
  }
  assert.equal(safeAiErrorCode(new DOMException("private detail","TimeoutError")),"AI_TIMEOUT");
  assert.equal(safeAiErrorCode(new Error("AI_INSUFFICIENT_BALANCE")),"AI_INSUFFICIENT_BALANCE");
  assert.equal(safeAiErrorCode(new Error("unknown private error")),undefined);
  assert.equal(aiErrorMessage("__proto__"),undefined);
});
