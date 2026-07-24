// ═══════════════════════════════════════════════════════════════════════════════
// 模块声明 & 轻量命令入口
// ═══════════════════════════════════════════════════════════════════════════════

mod categories;
mod client;
mod danmaku_cache;
mod danmu_server;
mod detail;
mod mapping;
mod models;
mod parser;
mod proxy;
mod search;
mod source_handlers;
mod sources;

use std::time::Instant;

use client::CLIENT;
use models::DanmuItem;
use parser::{extract_episode_num, urlencode};
use sources::{collect_sources, SourceStatus};

// ═══════════════════════════════════════════════════════════════════════════════
// 命令：视频代理端口
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
async fn get_proxy_port() -> u16 {
    proxy::get_proxy_port().unwrap_or(0)
}

/// 检测系统代理模式
#[derive(serde::Serialize)]
struct ProxyModeInfo {
    /// true = 检测到虚拟网卡模式代理（如 Clash TUN/Surge/V2Ray TUN）
    pub has_tun: bool,
    /// true = 检测到 HTTP 环境变量代理
    pub has_http_proxy: bool,
}

#[tauri::command]
fn check_proxy_mode() -> ProxyModeInfo {
    let has_http_proxy = std::env::var("HTTP_PROXY")
        .or_else(|_| std::env::var("HTTPS_PROXY"))
        .or_else(|_| std::env::var("http_proxy"))
        .or_else(|_| std::env::var("https_proxy"))
        .ok()
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    let has_tun = std::process::Command::new("ifconfig")
        .output()
        .ok()
        .map(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout);
            #[cfg(target_os = "macos")]
            {
                // 检测有 IPv4 地址的 utun 接口（代理 TUN 激活的标志）
                // 系统服务创建的 utun 通常只有 IPv6，代理才有 IPv4
                let lines: Vec<&str> = stdout.lines().collect();
                let mut i = 0;
                while i < lines.len() {
                    let line = lines[i];
                    if line.starts_with("utun") && line.contains(": flags=") {
                        // 查看此接口后续缩进行中是否有 IPv4 地址
                        i += 1;
                        while i < lines.len() {
                            let next = lines[i];
                            if !next.starts_with(' ') && !next.starts_with('\t') {
                                break; // 下一个接口开始了
                            }
                            if next.trim_start().starts_with("inet ") {
                                return true;
                            }
                            i += 1;
                        }
                        continue; // while 外层会再 i++
                    }
                    i += 1;
                }
                false
            }
            #[cfg(target_os = "linux")]
            {
                stdout.lines().filter(|l| l.starts_with("tun")).count() > 0
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux")))]
            {
                let _ = stdout;
                false
            }
        })
        .unwrap_or(false);

    ProxyModeInfo { has_tun, has_http_proxy }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 命令：源连通性检测
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
async fn check_sources() -> Vec<SourceStatus> {
    let mut all = collect_sources().await;
    let mut seen = std::collections::HashSet::new();
    all.retain(|s| seen.insert(s.url.clone()));

    let mut out = Vec::new();
    for src in &all {
        let t0 = Instant::now();
        let url = format!("{}/?ac=list&t=1&pg=1", src.url.trim_end_matches('/'));
        let reachable = CLIENT
            .get(&url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        eprintln!(
            "[check] {} ({}) reachable={}, {}ms",
            src.name,
            url,
            reachable,
            t0.elapsed().as_millis()
        );
        out.push(SourceStatus {
            name: src.name.clone(),
            url: src.url.clone(),
            reachable,
            latency_ms: t0.elapsed().as_millis() as u64,
        });
    }
    out
}

// ═══════════════════════════════════════════════════════════════════════════════
// 命令：分类列表
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
async fn fetch_categories() -> Vec<categories::CatDisplayItem> {
    let sources = collect_sources().await;
    categories::build_mapping(&sources).await
}

/// 获取指定一级分类的二级分类列表（本地映射表，不请求网络）
#[tauri::command]
async fn fetch_subcategories(parent_type_id: i32) -> Vec<categories::SubCategoryItem> {
    categories::get_subcategories(parent_type_id)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 命令：弹幕
// ═══════════════════════════════════════════════════════════════════════════════

/// 弹弹play 弹幕服务
const DANDANPLAY_BASE: &str = "https://api.dandanplay.net";
/// danmu_api 公共实例（社区维护，覆盖更多平台：爱奇艺/优酷/腾讯/B站/芒果等）
const DANMU_API_FALLBACK: &str = "https://dm.stardm.us.kg/87654321";

#[tauri::command]
async fn fetch_danmaku(title: String, episode_label: String) -> Result<Vec<DanmuItem>, String> {
    eprintln!("[danmaku] searching for '{}' ep='{}'", title, episode_label);

    // ── 1. 查本地缓存 ──
    if let Some(cached) = danmaku_cache::get_cached(&title, &episode_label) {
        eprintln!("[danmaku] cache HIT: {} items for '{}'", cached.len(), title);
        return Ok(cached);
    }
    eprintln!("[danmaku] cache MISS, trying remote...");

    // ── 2. 远程获取 ──

    // Try 1: 本地 danmu_api 服务（Sidecar，最快且不依赖外网）
    if let Some(local_base) = danmu_server::get_base_url() {
        match fetch_danmaku_from_base(&local_base, "local", &title, &episode_label).await {
            Ok(danmu) if !danmu.is_empty() => {
                eprintln!("[danmaku] local: {} items", danmu.len());
                danmaku_cache::set_cache(&title, &episode_label, &danmu);
                return Ok(danmu);
            }
            _ => eprintln!("[danmaku] local: no results"),
        }
    }

    // Try 2: 弹弹play（动漫弹幕为主）
    match fetch_danmaku_from_base(DANDANPLAY_BASE, "dandanplay", &title, &episode_label).await {
        Ok(danmu) if !danmu.is_empty() => {
            eprintln!("[danmaku] dandanplay: {} items", danmu.len());
            danmaku_cache::set_cache(&title, &episode_label, &danmu);
            return Ok(danmu);
        }
        _ => {
            eprintln!("[danmaku] dandanplay: no results, trying fallback...");
        }
    }

    // Try 3: danmu_api 公共实例（外网 fallback）
    let danmu = match fetch_danmaku_from_base(DANMU_API_FALLBACK, "danmu_api", &title, &episode_label).await {
        Ok(d) => {
            eprintln!("[danmaku] danmu_api: {} items", d.len());
            d
        }
        Err(e) => {
            eprintln!("[danmaku] all sources failed: {}", e);
            return Err(e);
        }
    };

    danmaku_cache::set_cache(&title, &episode_label, &danmu);
    Ok(danmu)
}

/// 从指定的弹幕服务基地址获取弹幕（兼容弹弹play API 规范）
async fn fetch_danmaku_from_base(
    base_url: &str,
    source_label: &str,
    title: &str,
    episode_label: &str,
) -> Result<Vec<DanmuItem>, String> {
    let encoded_title = urlencode(title);
    let search_url = format!(
        "{}/api/v2/search/anime?keyword={}",
        base_url, encoded_title
    );

    let resp = CLIENT
        .get(&search_url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            let kind = if e.is_timeout() { "timeout" }
                else if e.is_connect() { "connect" }
                else if e.is_request() { "request" }
                else { "unknown" };
            let msg = format!("[{}] search FAILED ({kind}): {e}", source_label);
            eprintln!("{}", msg);
            msg
        })?;
    if !resp.status().is_success() {
        let msg = format!("[{}] search HTTP {}", source_label, resp.status());
        eprintln!("{}", msg);
        return Err(msg);
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| {
            let msg = format!("[{}] search parse: {}", source_label, e);
            eprintln!("{}", msg);
            msg
        })?;

    let animes = body["animes"]
        .as_array()
        .ok_or_else(|| {
            let msg = format!("[{}] no animes in response", source_label);
            eprintln!("{}", msg);
            msg
        })?;
    let anime = animes
        .first()
        .ok_or_else(|| {
            let msg = format!("[{}] no matching anime for '{}'", source_label, title);
            eprintln!("{}", msg);
            msg
        })?;
    let anime_id = anime["animeId"]
        .as_i64()
        .ok_or_else(|| {
            let msg = format!("[{}] missing animeId", source_label);
            eprintln!("{}", msg);
            msg
        })?;

    eprintln!("[{}] matched anime_id={} for '{}'", source_label, anime_id, title);

    // 获取剧集列表
    let ep_url = format!(
        "{}/api/v2/search/episodes?animeId={}",
        base_url, anime_id
    );
    let resp = CLIENT
        .get(&ep_url)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("[{}] episodes failed: {}", source_label, e);
            eprintln!("{}", msg);
            msg
        })?;
    let ep_body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| {
            let msg = format!("[{}] episodes parse: {}", source_label, e);
            eprintln!("{}", msg);
            msg
        })?;

    let episodes = ep_body["episodes"]
        .as_array()
        .ok_or_else(|| {
            let msg = format!("[{}] no episodes", source_label);
            eprintln!("{}", msg);
            msg
        })?;

    // 匹配剧集
    let target_num = extract_episode_num(episode_label);
    eprintln!("[{}] episode_label='{}' → parsed_num={:?}, total_episodes={}", source_label, episode_label, target_num, episodes.len());
    let matched = if let Some(num) = target_num {
        episodes
            .iter()
            .find(|ep| ep["episodeNumber"].as_i64() == Some(num as i64))
            .or_else(|| episodes.first())
    } else {
        episodes.first()
    };
    let episode = matched.ok_or_else(|| {
        let msg = format!("[{}] no matching episode for '{}'", source_label, episode_label);
        eprintln!("{}", msg);
        msg
    })?;
    let episode_id = episode["episodeId"]
        .as_i64()
        .ok_or_else(|| {
            let msg = format!("[{}] missing episodeId", source_label);
            eprintln!("{}", msg);
            msg
        })?;

    eprintln!("[{}] matched episode_id={} for '{}'", source_label, episode_id, episode_label);

    // 获取弹幕
    let comment_url = format!(
        "{}/api/v2/comment/{}?format=json",
        base_url, episode_id
    );
    let resp = CLIENT
        .get(&comment_url)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("[{}] comment failed: {}", source_label, e);
            eprintln!("{}", msg);
            msg
        })?;
    let cmt_body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| {
            let msg = format!("[{}] comment parse: {}", source_label, e);
            eprintln!("{}", msg);
            msg
        })?;

    let comments = cmt_body["comments"]
        .as_array()
        .ok_or_else(|| {
            let msg = format!("[{}] no comments", source_label);
            eprintln!("{}", msg);
            msg
        })?;

    let danmu: Vec<DanmuItem> = comments
        .iter()
        .filter_map(|c| {
            let text = c["m"].as_str()?;
            if text.trim().is_empty() {
                return None;
            }
            let p = c["p"].as_str()?;
            let parts: Vec<&str> = p.split(',').collect();
            if parts.len() < 4 {
                return None;
            }
            let time: f64 = parts[0].parse().ok()?;
            let mode: i32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            let color_int: u32 = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0xFFFFFF);
            let color = format!("#{:06x}", color_int);
            Some(DanmuItem {
                text: text.to_string(),
                mode,
                color,
                time,
            })
        })
        .collect();

    eprintln!(
        "[{}] '{}' ep='{}' → anime={} episode={} danmu={}",
        source_label,
        title,
        episode_label,
        anime_id,
        episode_id,
        danmu.len()
    );
    Ok(danmu)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 应用入口
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            // 启动本地视频代理（非阻塞）
            tauri::async_runtime::spawn(async {
                let _ = proxy::start().await;
            });
            // 启动本地弹幕服务器（非阻塞）
            tauri::async_runtime::spawn(async {
                danmu_server::start().await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search::search_video,
            detail::get_video_detail,
            detail::fetch_source_detail,
            get_proxy_port,
            check_proxy_mode,
            check_sources,
            fetch_categories,
            fetch_subcategories,
            fetch_danmaku,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
