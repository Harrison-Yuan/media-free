// ═══════════════════════════════════════════════════════════════════════════════
// 视频源定义、发现与优先级查询策略
// ═══════════════════════════════════════════════════════════════════════════════

use crate::client::CLIENT;
use crate::models::SourceDef;

use futures::future::join_all;
use futures::stream::FuturesUnordered;
use futures::StreamExt;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;

// ─── 源定义 ────────────────────────────────────────────────────────────────

/// 调试模式：单源验证
///
/// 设为 `Some("源名称")` 时只使用该源，便于逐平台验证。
/// 设为 `None` 则使用全部源（正式模式）。
pub const DEBUG_SINGLE_SOURCE: Option<&str> = Some("量子资源");

/// 调试模式：仅使用 TVBox 发现源，跳过内置源
/// 设为 `true` 时跳过 BUILTIN_SOURCES，仅从 TVBox 配置中发现源
pub const DEBUG_TVBOX_ONLY: bool = false;

/// TVBox 配置 URL 列表，从中发现 type=1 的视频源
const TVBOX_CONFIGS: &[&str] = &[
    "https://raw.liucn.cc/box/m.json",
    "https://bjq.catvod.site/",
    "https://file.alexlin1688.top/my_file/tvbox/alexlin_db06/ok_m01.json",
    "https://9280.kstore.vip/wex.json",
    "http://fmys.top/fmys.json",
];

/// 可直接播放的苹果 CMS 采集源（type=1 XML/JSON API）
pub const BUILTIN_SOURCES: &[(&str, &str)] = &[
    ("量子资源", "https://cj.lziapi.com/api.php/provide/vod/at/json"),
    ("非凡资源", "http://cj.ffzyapi.com/api.php/provide/vod/at/json"),
    ("红牛资源", "https://www.hongniuzy2.com/api.php/provide/vod/at/json"),
    ("短剧资源", "https://api.duanjuzy.com/api.php/provide/vod/at/json"),
];

// ─── 优先级查询策略 ─────────────────────────────────────────────────────────

/// 判断是否为内置稳定源
pub fn is_builtin_source(name: &str) -> bool {
    BUILTIN_SOURCES.iter().any(|(n, _)| *n == name)
}

/// 按优先级并行收集异步任务结果
///
/// 阶段 1：内置源优先（builtin_timeout 内等待）
/// 阶段 2：TVBox 源次之（tvbox_timeout 内等待）
/// 返回所有成功完成的结果（按完成顺序）
///
/// 若 `cancelled` 在某阶段超时后被设为 true，提醒调用方后续可中止相关工作。
pub async fn collect_priority<T>(
    sources: &[SourceDef],
    build: impl Fn(&SourceDef) -> tokio::task::JoinHandle<T>,
    builtin_timeout: std::time::Duration,
    tvbox_timeout: std::time::Duration,
    cancelled: Option<Arc<AtomicBool>>,
) -> Vec<T> {
    let mut builtin = FuturesUnordered::new();
    let mut tvbox = FuturesUnordered::new();

    for src in sources {
        let task = build(src);
        if is_builtin_source(&src.name) {
            builtin.push(task);
        } else {
            tvbox.push(task);
        }
    }

    let mut results = Vec::new();

    // Phase 1: builtin sources
    if !builtin.is_empty() {
        let deadline = tokio::time::sleep(builtin_timeout);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                result = builtin.next() => {
                    match result {
                        Some(Ok(r)) => results.push(r),
                        Some(_) => {},
                        None => break,
                    }
                }
                _ = &mut deadline => {
                    if let Some(ref flag) = cancelled {
                        flag.store(true, Ordering::Relaxed);
                    }
                    break;
                }
            }
        }
    }

    // Phase 2: TVBox sources
    if !tvbox.is_empty() {
        let deadline = tokio::time::sleep(tvbox_timeout);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                result = tvbox.next() => {
                    match result {
                        Some(Ok(r)) => results.push(r),
                        Some(_) => {},
                        None => break,
                    }
                }
                _ = &mut deadline => {
                    if let Some(ref flag) = cancelled {
                        flag.store(true, Ordering::Relaxed);
                    }
                    break;
                }
            }
        }
    }

    results
}

// ─── 源发现 ────────────────────────────────────────────────────────────────

/// 从 TVBox 配置 JSON 提取 type=1 XML API 源
fn extract_type1(text: &str) -> Vec<SourceDef> {
    let mut out = Vec::new();
    let cleaned = strip_comments(text);
    let val: serde_json::Value = match serde_json::from_str(&cleaned) {
        Ok(v) => v,
        Err(_) => return out,
    };
    let sites = val
        .get("sites")
        .and_then(|v| v.as_array())
        .or_else(|| val.as_array().map(|a| a));
    let sites = match sites {
        Some(s) => s,
        None => return out,
    };

    for site in sites {
        let obj = match site.as_object() {
            Some(o) => o,
            None => continue,
        };
        let _t = match obj.get("type").and_then(|v| v.as_i64()) {
            Some(1) => 1,
            _ => continue,
        };
        let api = match obj.get("api").and_then(|v| v.as_str()) {
            Some(a) if a.starts_with("http") => a.to_string(),
            _ => continue,
        };
        let name = obj
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("未知")
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        out.push(SourceDef { name, url: api });
    }
    out
}

fn strip_comments(json: &str) -> String {
    let mut r = String::with_capacity(json.len());
    let c: Vec<char> = json.chars().collect();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '"' {
            r.push('"');
            i += 1;
            while i < c.len() {
                r.push(c[i]);
                if c[i] == '\\' && i + 1 < c.len() {
                    i += 1;
                    r.push(c[i]);
                } else if c[i] == '"' {
                    break;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        if c[i] == '/' && i + 1 < c.len() && c[i + 1] == '/' {
            i += 2;
            while i < c.len() && c[i] != '\n' {
                i += 1;
            }
            if i < c.len() {
                r.push('\n');
                i += 1;
            }
            continue;
        }
        r.push(c[i]);
        i += 1;
    }
    r
}

fn idn_encode(url: &str) -> String {
    use url::Url;
    if let Ok(p) = Url::parse(url) {
        return p.to_string();
    }
    if let Some(pos) = url.find("://") {
        let (s, rest) = url.split_at(pos + 3);
        let host_end = rest
            .find(|c: char| c == '/' || c == ':')
            .unwrap_or(rest.len());
        let host = &rest[..host_end];
        if host.bytes().any(|b| b > 127) {
            if let Ok(p) = Url::parse(&format!("{}{}/", s, host)) {
                if let Some(h) = p.host_str() {
                    return format!("{}{}{}", s, h, &rest[host_end..]);
                }
            }
        }
    }
    url.to_string()
}

static SOURCES_CACHE: OnceLock<Mutex<Option<Vec<SourceDef>>>> = OnceLock::new();

/// 收集所有可用视频源（内置源 + TVBox 发现的 type=1 源）
///
/// 当 `DEBUG_SINGLE_SOURCE` 设为 `Some(name)` 时，仅返回匹配的单个源，
/// 用于逐平台验证。设为 `None` 时返回全部源（正式模式）。
pub async fn collect_sources() -> Vec<SourceDef> {
    // 已有缓存则直接返回
    {
        let cache = SOURCES_CACHE.get_or_init(|| Mutex::new(None));
        let guard = cache.lock().await;
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }

    let mut sources: Vec<SourceDef> = if DEBUG_TVBOX_ONLY {
        eprintln!("[sources] debug: 跳过内置源，仅使用 TVBox 发现源");
        Vec::new()
    } else {
        BUILTIN_SOURCES
            .iter()
            .map(|(n, u)| SourceDef {
                name: n.to_string(),
                url: u.to_string(),
            })
            .collect()
    };

    // TVBox 动态发现（除非单源调试模式中使用了已知源名称）
    if DEBUG_SINGLE_SOURCE.is_none() {
        let mut seen: HashSet<String> = sources.iter().map(|s| s.url.clone()).collect();
        let mut tasks = Vec::new();
        for &url in TVBOX_CONFIGS {
            let u = idn_encode(url);
            tasks.push(tokio::spawn(async move {
                if let Ok(resp) = CLIENT.get(&u).send().await {
                    if resp.status().is_success() {
                        if let Ok(bytes) = resp.bytes().await {
                            return Some(String::from_utf8_lossy(&bytes).to_string());
                        }
                    }
                }
                None
            }));
        }
        for r in join_all(tasks).await {
            if let Ok(Some(text)) = r {
                for s in extract_type1(&text) {
                    if seen.insert(s.url.clone()) {
                        let name = s.name.trim().to_string();
                        if !name.is_empty() {
                            sources.push(SourceDef { name, url: s.url });
                        }
                    }
                }
            }
        }
    }

    // ── 单源调试模式过滤 ──
    if let Some(debug_name) = DEBUG_SINGLE_SOURCE {
        sources.retain(|s| {
            let matched = s.name.contains(debug_name);
            if !matched {
                eprintln!("[sources] debug: 跳过 {}", s.name);
            }
            matched
        });
        eprintln!("[sources] debug: 仅使用 \"{}\" ({} 个源)", debug_name, sources.len());
    } else {
        eprintln!("[sources] {} type=1 XML API 源", sources.len());
    }

    *SOURCES_CACHE.get().unwrap().lock().await = Some(sources.clone());
    sources
}

/// 源连通性状态
#[derive(serde::Serialize)]
pub struct SourceStatus {
    pub name: String,
    pub url: String,
    pub reachable: bool,
    pub latency_ms: u64,
}
