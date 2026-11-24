use super::read_limited_json;
use crate::retest::Topic;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
const MODEL: &str = "deepseek-flash";
const SERVICE: &str = "StepMark Desktop";
const ACCOUNT: &str = "deepseek-workspace";
const MAX_HISTORY: usize = 6;
const MAX_INPUT: usize = 4000;
const WORKSPACE_PROMPT: &str = concat!(
    "You are StepMark's working partner. The user's long-term objective is the agency to notice and understand problems, learn what is needed, use tools, create useful things, collaborate, and choose their own direction. ",
    "Work on the user's actual case now. Make immediate useful progress: reason through the facts, explain the concept, draft the message or artifact, or write practical steps they can run. Avoid generic plans, motivational filler, unnecessary homework, and scoring. ",
    "Make reasonable low-risk assumptions explicit. If essential information is missing, give a useful conditional result first and ask at most one focused question in nextStep. Connect any next step to an observation that would change the decision. When the user reports an actual result, revise the deliverable and explain what the evidence changes. ",
    "Do not invent observations, sources or test results or claim to have run tools or contacted anyone. Flag uncertain claims as such. Respect privacy and avoid asking for secrets. ",
    "Return one JSON object in the user's language. Example: {\"analysis\":\"The concrete finding and why it matters\",\"deliverable\":\"A useful draft, worked example or validation procedure, ready to copy\",\"nextStep\":\"The single most useful next action or question\",\"retestTopic\":null}. ",
    "Set retestTopic to limits only for limits and equivalent infinitesimal substitution, or evidence only for exercises in interpreting evidence, comparison, or causality. Otherwise set it to null. The app uses an independent question bank for that retest. ",
    "Use plain text and line breaks in values. Keep analysis below 1100 characters and deliverable below 4500 characters. Leave deliverable empty only when the analysis already answers the whole question. Leave nextStep empty when the work is complete."
);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkResult {
    analysis: String,
    deliverable: String,
    next_step: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    retest_topic: Option<Topic>,
}

impl WorkResult {
    fn validate(self) -> Result<Self, String> {
        if self.analysis.trim().is_empty()
            || self.analysis.chars().count() > 1600
            || self.deliverable.chars().count() > 6000
            || self.next_step.chars().count() > 600
        {
            return Err("DeepSeek 返回的内容超出范围，请重试。".into());
        }
        Ok(self)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WorkTurn {
    question: String,
    result: WorkResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeepSeekStatus {
    configured: bool,
    saved_here: bool,
    model: &'static str,
}

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "无法打开 Windows 凭据管理器。".into())
}

fn saved_key() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取本机保存的 DeepSeek 密钥。".into()),
    }
}

fn validate_key(raw: &str) -> Result<&str, String> {
    let key = raw.trim();
    if !key.starts_with("sk-") || !(16..=180).contains(&key.len())
        || !key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("请输入 DeepSeek 官方 API Key。".into());
    }
    Ok(key)
}

fn environment_key() -> Option<String> {
    std::env::var("DEEPSEEK_API_KEY").ok().and_then(|key| validate_key(&key).ok().map(str::to_owned))
}

fn effective_key() -> Result<String, String> {
    if let Some(saved) = saved_key()? {
        return Ok(validate_key(&saved)?.to_owned());
    }
    environment_key().ok_or_else(|| "请先连接 DeepSeek。".into())
}

fn error_for_status(status: reqwest::StatusCode) -> &'static str {
    match status.as_u16() {
        401 | 403 => "DeepSeek 拒绝了此密钥，请检查密钥和权限。",
        402 => "DeepSeek 账户余额不足。",
        429 => "DeepSeek 当前请求较多，请稍后重试。",
        400 | 404 | 422 => "DeepSeek 拒绝了请求，请确认账号可以使用 Flash 模型。",
        _ => "DeepSeek 服务暂时不可用，请稍后重试。",
    }
}

async fn complete(key: &str, messages: Vec<Value>, max_tokens: u32) -> Result<Value, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(35))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化 DeepSeek 连接。".to_owned())?
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&json!({
            "model": MODEL, "messages": messages, "max_tokens": max_tokens,
            "thinking": {"type": "disabled"}, "response_format": {"type": "json_object"}
        }))
        .send()
        .await
        .map_err(|error| if error.is_timeout() {
            "DeepSeek 响应超时，请重试。"
        } else {
            "连接 DeepSeek 失败，请检查网络或代理。"
        }.to_owned())?;
    if !response.status().is_success() {
        return Err(error_for_status(response.status()).into());
    }
    let value = read_limited_json(response).await?;
    let choice = &value["choices"][0];
    if choice["finish_reason"].as_str() != Some("stop") {
        return Err("DeepSeek 没有完整返回结果，请缩短问题或重试。".into());
    }
    let content = choice["message"]["content"].as_str().unwrap_or("");
    serde_json::from_str(content).map_err(|_| "DeepSeek 没有返回可用内容，请重试。".into())
}

async fn verify_key(key: &str) -> Result<(), String> {
    let result = complete(key, vec![
        json!({"role":"system","content":"This is an API connectivity test. Return only this exact JSON object: {\"ok\":true}."}),
        json!({"role":"user","content":"Test connection."}),
    ], 32).await?;
    if result["ok"].as_bool() != Some(true) {
        return Err("DeepSeek 没有返回有效的连接测试结果。".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn deepseek_status() -> Result<DeepSeekStatus, String> {
    let saved_here = saved_key()?.is_some();
    Ok(DeepSeekStatus { configured: saved_here || environment_key().is_some(), saved_here, model: MODEL })
}

#[tauri::command]
pub(crate) async fn check_deepseek() -> Result<(), String> {
    verify_key(&effective_key()?).await
}

#[tauri::command]
pub(crate) async fn save_deepseek_key(key: String) -> Result<(), String> {
    let key = validate_key(&key)?;
    verify_key(key).await?;
    credential()?.set_password(key).map_err(|_| "无法将密钥保存到 Windows 凭据管理器。".into())
}

#[tauri::command]
pub(crate) fn clear_deepseek_key() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法清除本机 DeepSeek 密钥。".into()),
    }
}

fn checked_question(question: &str) -> Result<&str, String> {
    let question = question.trim();
    if question.is_empty() || question.chars().count() > MAX_INPUT {
        return Err("请输入 1 到 4000 字符的问题。".into());
    }
    Ok(question)
}

fn workspace_messages(question: &str, history: Vec<WorkTurn>) -> Result<Vec<Value>, String> {
    let question = checked_question(question)?;
    if history.len() > MAX_HISTORY {
        return Err("此次附带的对话超过上限。".into());
    }
    let mut messages = vec![json!({"role":"system","content":WORKSPACE_PROMPT})];
    for turn in history {
        let previous_question = checked_question(&turn.question)?;
        let previous_result = serde_json::to_string(&turn.result.validate()?)
            .map_err(|_| "无法整理对话上下文。".to_owned())?;
        messages.push(json!({"role":"user","content":previous_question}));
        messages.push(json!({"role":"assistant","content":previous_result}));
    }
    messages.push(json!({"role":"user","content":question}));
    Ok(messages)
}

#[tauri::command]
pub(crate) async fn work_on_problem(question: String, history: Vec<WorkTurn>) -> Result<WorkResult, String> {
    let messages = workspace_messages(&question, history)?;
    let key = effective_key()?;
    let value = complete(&key, messages, 2400).await?;
    let result: WorkResult = serde_json::from_value(value)
        .map_err(|_| "DeepSeek 返回格式不完整，请重试。".to_owned())?;
    result.validate()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_preserves_turn_order_and_system_prompt() {
        let result = WorkResult { analysis: "Finding".into(), deliverable: "Artifact".into(), next_step: String::new(), retest_topic: None };
        let history = vec![WorkTurn { question: "First question".into(), result }];
        let messages = workspace_messages(" Second question ", history).unwrap();
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[1]["content"], "First question");
        assert_eq!(messages[2]["role"], "assistant");
        assert_eq!(messages[3]["content"], "Second question");
        assert!(workspace_messages(" ", vec![]).is_err());
        assert!(workspace_messages(&"界".repeat(MAX_INPUT + 1), vec![]).is_err());
    }

    #[test]
    fn keys_are_validated_and_statuses_are_actionable() {
        assert!(validate_key("sk-example-only-001").is_ok());
        assert!(validate_key("sk-example-only-001\nextra").is_err());
        assert!(error_for_status(reqwest::StatusCode::UNAUTHORIZED).contains("密钥"));
        assert!(error_for_status(reqwest::StatusCode::PAYMENT_REQUIRED).contains("余额"));
    }
}
