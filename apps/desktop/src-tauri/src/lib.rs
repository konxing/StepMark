use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};
use url::Url;

mod ai_workspace;
mod retest;

const CREDENTIAL_SERVICE: &str = "StepMark Desktop";
const CREDENTIAL_ACCOUNT: &str = "session";
const CALLBACK_WAIT: Duration = Duration::from_secs(180);
const MAX_API_RESPONSE: usize = 256 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    api_origin: String,
    signed_in: bool,
    read_only: bool,
}

fn validate_origin(raw: &str, debug: bool) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "未配置有效的 API 服务地址".to_owned())?;
    let localhost = debug && raw == "http://localhost:3000";
    if !localhost && url.scheme() != "https" {
        return Err("桌面客户端仅允许 HTTPS API".to_owned());
    }
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.origin().ascii_serialization() != raw
        || (!localhost && url.port().is_some())
    {
        return Err("API 地址必须是单一 HTTPS origin".to_owned());
    }
    if !localhost {
        let host = url.host_str().unwrap_or("");
        if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local")
            || host.parse::<std::net::IpAddr>().is_ok()
        {
            return Err("正式客户端不允许本机或 IP API 地址".to_owned());
        }
    }
    Ok(raw.to_owned())
}

fn api_origin() -> Result<String, String> {
    let raw = option_env!("STEPMARK_API_ORIGIN").unwrap_or(if cfg!(debug_assertions) {
        "http://localhost:3000"
    } else {
        ""
    });
    validate_origin(raw, cfg!(debug_assertions))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化安全网络连接".to_owned())
}

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|_| "Windows 凭据存储不可用".to_owned())
}
fn saved_token() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(token) if token.starts_with("sm_desktop_") => Ok(Some(token)),
        Ok(_) => Err("本机保存的登录凭据格式无效".to_owned()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 登录凭据".to_owned()),
    }
}
fn clear_token() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法清除 Windows 登录凭据".to_owned()),
    }
}

fn random_b64() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn callback_code(request_line: &str, state: &str) -> Option<String> {
    let mut fields = request_line.split_whitespace();
    if fields.next()? != "GET" {
        return None;
    }
    let target = fields.next()?;
    if fields.next()? != "HTTP/1.1" || fields.next().is_some() || !target.starts_with("/callback?") {
        return None;
    }
    let url = Url::parse(&format!("http://127.0.0.1{}", target)).ok()?;
    if url.path() != "/callback" || url.fragment().is_some() {
        return None;
    }
    let mut code = None;
    let mut received_state = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" if code.is_none() => code = Some(value.into_owned()),
            "state" if received_state.is_none() => received_state = Some(value.into_owned()),
            _ => return None,
        }
    }
    if received_state.as_deref() != Some(state) {
        return None;
    }
    let code = code?;
    if code.len() < 20 || code.len() > 2048 || !code.is_ascii() {
        return None;
    }
    Some(code)
}

async fn send_callback_page(stream: &mut tokio::net::TcpStream, success: bool) {
    let body = if success {
        "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>StepMark</title><p>已收到授权，请返回 StepMark Windows 桌面软件。</p></html>"
    } else {
        "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>StepMark</title><p>无效的桌面授权请求。</p></html>"
    };
    let status = if success { "200 OK" } else { "400 Bad Request" };
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
}

async fn wait_for_callback(listener: TcpListener, state: &str) -> Result<String, String> {
    let deadline = Instant::now() + CALLBACK_WAIT;
    loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or_else(|| "授权已超时，请重试".to_owned())?;
        let (mut stream, peer) = timeout(remaining, listener.accept())
            .await
            .map_err(|_| "授权已超时，请重试".to_owned())?
            .map_err(|_| "无法接收浏览器授权回调".to_owned())?;
        if !peer.ip().is_loopback() {
            continue;
        }
        let mut data = Vec::with_capacity(1024);
        loop {
            let mut chunk = [0u8; 1024];
            let n = match timeout(Duration::from_secs(5), stream.read(&mut chunk)).await {
                Ok(Ok(n)) => n,
                _ => break,
            };
            if n == 0 {
                break;
            }
            data.extend_from_slice(&chunk[..n]);
            if data.windows(2).any(|pair| pair == b"\r\n") || data.len() >= 8192 {
                break;
            }
        }
        let line = String::from_utf8_lossy(&data);
        let code = line
            .split("\r\n")
            .next()
            .and_then(|request| callback_code(request, state));
        send_callback_page(&mut stream, code.is_some()).await;
        if let Some(code) = code {
            return Ok(code);
        }
    }
}

/// Stream a bounded JSON response: Content-Length is advisory and may be absent
/// for chunked transfer encoding. Never buffer an unbounded body first.
async fn read_limited_json(mut response: reqwest::Response) -> Result<Value, String> {
    if response.content_length().unwrap_or(0) > MAX_API_RESPONSE as u64 {
        return Err("服务器响应超过安全上限".to_owned());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取服务器响应失败".to_owned())?
    {
        if chunk.len() > MAX_API_RESPONSE.saturating_sub(bytes.len()) {
            return Err("服务器响应超过安全上限".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "服务器响应格式无效".to_owned())
}

async fn api_get(path: &str, token: &str) -> Result<Value, String> {
    let origin = api_origin()?;
    let response = client()?
        .get(format!("{}{}", origin, path))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络或服务器状态".to_owned())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let _ = clear_token();
        return Err("登录已过期，请重新连接账号".to_owned());
    }
    if !response.status().is_success() {
        return Err("服务暂时无法读取个人数据".to_owned());
    }
    read_limited_json(response).await
}

#[tauri::command]
fn get_status() -> Result<DesktopStatus, String> {
    Ok(DesktopStatus {
        api_origin: api_origin()?,
        signed_in: saved_token()?.is_some(),
        read_only: true,
    })
}

#[tauri::command]
async fn sign_in() -> Result<Value, String> {
    let origin = api_origin()?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| "无法启动本机安全授权回调".to_owned())?;
    let port = listener
        .local_addr()
        .map_err(|_| "无法取得本机回调端口".to_owned())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let verifier = random_b64();
    let state = random_b64();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = Url::parse(&format!("{}/api/v1/auth/desktop/authorize", origin))
        .map_err(|_| "无法创建授权地址".to_owned())?;
    url.query_pairs_mut()
        .append_pair("code_challenge", &challenge)
        .append_pair("state", &state)
        .append_pair("redirect_uri", &redirect_uri);
    webbrowser::open(url.as_str()).map_err(|_| "无法打开系统默认浏览器".to_owned())?;
    let code = wait_for_callback(listener, &state).await?;
    let response = client()?
        .post(format!("{}/api/v1/auth/desktop/exchange", origin))
        .json(&json!({"code":code,"codeVerifier":verifier,"redirectUri":redirect_uri}))
        .send()
        .await
        .map_err(|_| "无法完成安全授权交换".to_owned())?;
    if !response.status().is_success() {
        return Err("授权码无效或已过期，请重新登录".to_owned());
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Exchange {
        access_token: String,
    }
    let exchange: Exchange = response
        .json()
        .await
        .map_err(|_| "授权服务器响应格式无效".to_owned())?;
    if !exchange.access_token.starts_with("sm_desktop_") {
        return Err("授权令牌格式无效".to_owned());
    }
    // Validate the server identity before persisting the credential.
    let me = api_get("/api/v1/me", &exchange.access_token).await?;
    credential()?
        .set_password(&exchange.access_token)
        .map_err(|_| "无法安全保存 Windows 登录凭据".to_owned())?;
    Ok(me)
}

#[tauri::command]
async fn get_me() -> Result<Value, String> {
    let token = saved_token()?.ok_or_else(|| "请先连接账号".to_owned())?;
    api_get("/api/v1/me", &token).await
}

#[tauri::command]
async fn get_habits() -> Result<Value, String> {
    let token = saved_token()?.ok_or_else(|| "请先连接账号".to_owned())?;
    let value = api_get("/api/v1/habits", &token).await?;
    if !value.get("habits").is_some_and(Value::is_array) {
        return Err("习惯数据格式无效".to_owned());
    }
    Ok(value)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogoutResult {
    local_cleared: bool,
    server_revoked: bool,
}

#[tauri::command]
async fn sign_out() -> Result<LogoutResult, String> {
    let token = saved_token()?;
    let mut server_revoked = token.is_none();
    if let Some(ref token) = token {
        if let Ok(origin) = api_origin() {
            if let Ok(http) = client() {
                if let Ok(response) = http
                    .post(format!("{}/api/v1/auth/desktop/logout", origin))
                    .bearer_auth(token)
                    .send()
                    .await
                {
                    server_revoked = response.status().is_success()
                        || response.status() == reqwest::StatusCode::UNAUTHORIZED;
                }
            }
        }
    }
    clear_token()?;
    Ok(LogoutResult {
        local_cleared: true,
        server_revoked,
    })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_status,
            sign_in,
            get_me,
            get_habits,
            sign_out,
            ai_workspace::deepseek_status,
            ai_workspace::check_deepseek,
            ai_workspace::save_deepseek_key,
            ai_workspace::clear_deepseek_key,
            ai_workspace::work_on_problem,
            retest::get_retest,
            retest::submit_retest
        ])
        .run(tauri::generate_context!())
        .expect("StepMark desktop initialization failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_origin_is_explicit_and_never_accepts_http_in_release() {
        assert!(validate_origin("https://api.stepmark.example", false).is_ok());
        for raw in [
            "",
            "http://api.stepmark.example",
            "https://api.stepmark.example/path",
            "https://api.stepmark.example?x=1",
            "https://user:pass@api.stepmark.example",
            "https://localhost",
            "https://127.0.0.1",
            "https://api.stepmark.example.evil.test:444",
        ] {
            assert!(validate_origin(raw, false).is_err(), "{}", raw);
        }
        assert!(validate_origin("http://localhost:3000", true).is_ok());
        assert!(validate_origin("http://localhost:3000", false).is_err());
    }

    #[test]
    fn callback_requires_exact_state_path_and_single_code() {
        let state = random_b64();
        let line = format!("GET /callback?code=abc123abc123abc123abc123&state={} HTTP/1.1", state);
        assert_eq!(callback_code(&line, &state).as_deref(), Some("abc123abc123abc123abc123"));
        assert!(callback_code(&line, "wrong").is_none());
        assert!(callback_code("POST /callback?code=abc HTTP/1.1", &state).is_none());
        assert!(callback_code("GET /callback?code=x&code=y&state=z HTTP/1.1", "z").is_none());
        assert!(callback_code("GET /other?code=x&state=z HTTP/1.1", "z").is_none());
    }

    #[test]
    fn chunked_api_response_is_bounded_without_content_length() {
        tauri::async_runtime::block_on(async {
            let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = [0u8; 1024];
                let _ = stream.read(&mut request).await;
                let _ = stream.write_all(
                    b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                ).await;
                for size in [180 * 1024, 90 * 1024] {
                    let payload = vec![b'x'; size];
                    let _ = stream.write_all(format!("{size:X}\r\n").as_bytes()).await;
                    let _ = stream.write_all(&payload).await;
                    let _ = stream.write_all(b"\r\n").await;
                }
                let _ = stream.write_all(b"0\r\n\r\n").await;
            });
            let response = reqwest::Client::new()
                .get(format!("http://{address}"))
                .send()
                .await
                .unwrap();
            let result = timeout(Duration::from_secs(10), read_limited_json(response))
                .await
                .expect("bounded response reader timed out");
            assert!(result.unwrap_err().contains("超过安全上限"));
            server.await.unwrap();
        });
    }
}
