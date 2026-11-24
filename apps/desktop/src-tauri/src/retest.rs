use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DAY_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_RECORD_BYTES: u64 = 2048;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Topic {
    Limits,
    Evidence,
}

struct Item {
    id: &'static str,
    prompt: &'static str,
    options: [&'static str; 3],
    answer: usize,
    explanation: &'static str,
}

const LIMITS: [Item; 3] = [
    Item {
        id: "limits-v1-product",
        prompt: "求 x→0 时 (sin x · tan x)/x² 的极限。以下哪种做法成立？",
        options: ["sin x、tan x 分别换成 x，极限为 1。", "两者都趋于 0，所以极限为 0。", "分子有两个趋于 0 的因子，直接代换失效。"],
        answer: 0,
        explanation: "把式子写成 (sin x / x)(tan x / x)。两个因子的极限都是 1，因此这里可在乘积中分别代换。",
    },
    Item {
        id: "limits-v1-cancellation",
        prompt: "有人求 x→0 时 (sin x−x)/x³ 的极限，先把 sin x 换成 x，得到 0。这一步成立吗？",
        options: ["成立，因为 sin x 与 x 等价。", "不成立。两个一阶项相消，需要保留 sin x 的三阶项。", "成立，只要 x 从正侧趋于 0。"],
        answer: 1,
        explanation: "一阶项在差式中抵消。sin x=x−x³/6+o(x³)，所以原极限是 −1/6。等价关系没有保留这里需要的高阶差。",
    },
    Item {
        id: "limits-v1-denominator",
        prompt: "x→0 时，(eˣ−1)/x→1。求 [ln(1+x)−x]/(eˣ−1)² 的极限时，哪个代换能保留原极限？",
        options: ["只把分子的 ln(1+x) 换成 x，得到 0。", "分子和分母都代换成最低阶等价式，得到 0。", "把整个分母 (eˣ−1)² 换成 x²，保留原分子。"],
        answer: 2,
        explanation: "整个分母与 x² 等价，比值趋于 1。分子的一阶项抵消，需保留 −x²/2+o(x²)，原式趋于 −1/2。",
    },
];

const EVIDENCE: [Item; 3] = [
    Item {
        id: "evidence-v1-confound",
        prompt: "一个小组把周会缩短后交付更快。同一周，他们也临时减少了需求量。哪条结论最稳妥？",
        options: ["缩短周会必然提高效率。", "交付变快了，但还要排除需求量变化的影响。", "需求少了，周会时长肯定没有影响。"],
        answer: 1,
        explanation: "两个变化同时出现，单次前后比较无法拆出各自影响。可以比较需求量相近、周会时长不同的阶段。",
    },
    Item {
        id: "evidence-v1-selection",
        prompt: "某学习工具只回访连续使用满一个月的人，其中 90% 说有效。哪条新增证据最能检验「多数新用户都受益」？",
        options: ["从全部新用户抽样，纳入中途停用者，用同一指标测量结果。", "继续问更多坚持满一个月的人。", "让成功用户写更详细的反馈。"],
        answer: 0,
        explanation: "持续使用者可能本来就更容易从工具获益。纳入停用者才能减少选择性回访带来的偏差。",
    },
    Item {
        id: "evidence-v1-baseline",
        prompt: "上线新提醒后，训练完成率从 50% 升到 58%。同期没有改提醒的可比小组从 50% 升到 57%。这组数据最支持什么？",
        options: ["提醒提高了 8 个百分点。", "提醒降低了 7 个百分点。", "相对可比小组多提高 1 个百分点，还需要更多证据判断是否来自提醒。"],
        answer: 2,
        explanation: "两组同期都上升，初步差值是 (58−50)−(57−50)=1 个百分点。样本波动和其他组间差异仍可能解释观察结果。",
    },
];

impl Topic {
    fn items(self) -> &'static [Item] {
        match self {
            Self::Limits => &LIMITS,
            Self::Evidence => &EVIDENCE,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Attempt {
    item_id: String,
    choice: usize,
    recorded_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Question {
    id: &'static str,
    prompt: &'static str,
    options: [&'static str; 3],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Outcome {
    attempt: Attempt,
    correct: bool,
    answer: usize,
    explanation: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Review {
    question: Option<Question>,
    attempts: Vec<Outcome>,
    next_at: Option<u64>,
    total: usize,
}

fn path_for(root: &Path, item: &Item) -> PathBuf {
    root.join(format!("{}.json", item.id))
}

fn read_attempt(root: &Path, item: &Item) -> Result<Option<Attempt>, String> {
    let file = match File::open(path_for(root, item)) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取本机复测记录。".into()),
    };
    let mut content = Vec::new();
    file.take(MAX_RECORD_BYTES + 1).read_to_end(&mut content)
        .map_err(|_| "无法读取本机复测记录。".to_owned())?;
    let invalid = || "本机复测记录格式无效。".to_owned();
    if content.len() as u64 > MAX_RECORD_BYTES { return Err(invalid()); }
    let attempt: Attempt = serde_json::from_slice(&content).map_err(|_| invalid())?;
    if attempt.item_id != item.id || attempt.choice >= item.options.len()
        || attempt.recorded_at > 8_640_000_000_000_000u64 - DAY_MS
    {
        return Err(invalid());
    }
    Ok(Some(attempt))
}

fn outcome(item: &Item, attempt: Attempt) -> Outcome {
    Outcome { correct: attempt.choice == item.answer, attempt, answer: item.answer, explanation: item.explanation }
}

fn review(root: &Path, topic: Topic, now: u64) -> Result<Review, String> {
    let items = topic.items();
    let mut attempts = Vec::new();
    let mut next = None;
    for item in items {
        match read_attempt(root, item)? {
            Some(attempt) => attempts.push(outcome(item, attempt)),
            None if next.is_none() => next = Some(item),
            None => (),
        }
    }
    let available_at = attempts.iter().map(|entry| entry.attempt.recorded_at).max()
        .map(|at| at.saturating_add(DAY_MS));
    let next_at = next.and(available_at).filter(|&at| now < at);
    let question = next.filter(|_| next_at.is_none()).map(|item| Question {
        id: item.id, prompt: item.prompt, options: item.options,
    });
    Ok(Review { question, attempts, next_at, total: items.len() })
}

fn record(root: &Path, topic: Topic, id: &str, choice: usize, now: u64) -> Result<Outcome, String> {
    let item = topic.items().iter().find(|item| item.id == id)
        .ok_or_else(|| "找不到这道复测题。".to_owned())?;
    if choice >= item.options.len() { return Err("请选择题目中的一个选项。".into()); }
    if let Some(saved) = read_attempt(root, item)? { return Ok(outcome(item, saved)); }
    if review(root, topic, now)?.question.as_ref().map(|question| question.id) != Some(id) {
        if let Some(saved) = read_attempt(root, item)? { return Ok(outcome(item, saved)); }
        return Err("这道复测题还未开放，请刷新后继续。".into());
    }
    let failed = |_| "无法保存本机复测记录。".to_owned();
    fs::create_dir_all(root).map_err(failed)?;
    let mut file = tempfile::NamedTempFile::new_in(root).map_err(failed)?;
    let attempt = Attempt { item_id: id.to_owned(), choice, recorded_at: now };
    serde_json::to_writer(&mut file, &attempt).map_err(|_| "无法编码本机复测记录。".to_owned())?;
    file.flush().map_err(failed)?;
    file.as_file().sync_all().map_err(failed)?;
    match file.persist_noclobber(path_for(root, item)) {
        Ok(_) => Ok(outcome(item, attempt)),
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
            read_attempt(root, item)?.map(|saved| outcome(item, saved))
                .ok_or_else(|| "未找到刚保存的复测记录，请重试。".into())
        }
        Err(_) => Err("无法保存本机复测记录。".into()),
    }
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_millis() as u64)
        .map_err(|_| "本机时间无效。".into())
}

fn records_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|path| path.join("independent-retests-v1"))
        .map_err(|_| "无法定位本机复测数据目录。".into())
}

#[tauri::command]
pub(crate) fn get_retest(app: tauri::AppHandle, topic: Topic) -> Result<Review, String> {
    review(&records_dir(&app)?, topic, now_ms()?)
}

#[tauri::command]
pub(crate) fn submit_retest(app: tauri::AppHandle, topic: Topic, id: String, choice: usize) -> Result<Review, String> {
    let root = records_dir(&app)?;
    let now = now_ms()?;
    record(&root, topic, &id, choice, now)?;
    review(&root, topic, now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_answer_survives_retries_and_unlocks_only_a_new_item_after_a_day() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let topic = Topic::Limits;
        let now = DAY_MS * 4;
        let first = review(root, topic, now).unwrap().question.unwrap();
        let public = serde_json::to_value(&first).unwrap();
        assert_eq!(public.as_object().unwrap().len(), 3);
        assert!(public.get("answer").is_none());
        assert!(record(root, topic, LIMITS[1].id, 1, now).is_err());
        assert!(record(root, topic, first.id, 3, now).is_err());
        let initial = record(root, topic, first.id, 2, now).unwrap();
        let repeat = record(root, topic, first.id, 0, now + 1).unwrap();
        assert_eq!(initial.attempt, repeat.attempt);
        assert!(!repeat.correct);
        let early = review(root, topic, now + DAY_MS - 1).unwrap();
        assert_eq!(early.next_at, Some(now + DAY_MS));
        assert!(early.question.is_none());
        let next = review(root, topic, now + DAY_MS).unwrap().question.unwrap();
        assert_eq!(next.id, LIMITS[1].id);
        assert_eq!(review(root, Topic::Evidence, now).unwrap().attempts.len(), 0);
    }

    #[test]
    fn completed_topic_does_not_recycle_questions_as_new_evidence() {
        let dir = tempfile::tempdir().unwrap();
        for (i, item) in EVIDENCE.iter().enumerate() {
            record(dir.path(), Topic::Evidence, item.id, item.answer, DAY_MS * (i as u64 + 1)).unwrap();
        }
        let completed = review(dir.path(), Topic::Evidence, DAY_MS * 4).unwrap();
        assert_eq!(completed.attempts.len(), EVIDENCE.len());
        assert!(completed.attempts.iter().all(|result| result.correct));
        assert!(completed.question.is_none() && completed.next_at.is_none());
    }
}
