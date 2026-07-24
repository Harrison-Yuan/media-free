// ═══════════════════════════════════════════════════════════════════════════════
// 模块声明 & 轻量命令入口
// ═══════════════════════════════════════════════════════════════════════════════

mod categories;
mod client;
mod danmaku_cache;
mod detail;
mod mapping;
mod models;
mod parser;
mod proxy;
mod search;
mod source_handlers;
mod sources;

use std::time::Instant;

use client::{CLIENT, DANMAKU_CLIENT};
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
//
// 策略：SQLite 缓存优先 → MISS 时从 Cloudflare Workers 远程拉取 → 写入缓存
// ═══════════════════════════════════════════════════════════════════════════════

/// 自部署的 Cloudflare Workers 弹幕 API 基地址（自定义域名 + Cloudflare CDN）
const DANMAKU_WORKERS_BASE: &str = "https://danmu.cosvast.cn";

#[tauri::command]
async fn fetch_danmaku(title: String, episode_label: String) -> Result<Vec<DanmuItem>, String> {
    // 1. 缓存优先
    let cached = danmaku_cache::get_cached(&title, &episode_label).unwrap_or_default();
    if !cached.is_empty() {
        eprintln!("[danmaku] cache HIT: {} items for '{}'", cached.len(), title);
        return Ok(cached);
    }

    eprintln!("[danmaku] cache MISS, spawning background fetch for '{}'", title);

    // 2. 后台远程拉取（不阻塞播放器初始化）
    let t = title.clone();
    let el = episode_label.clone();
    tokio::spawn(async move {
        let danmu = fetch_danmaku_from_workers(&t, &el).await;
        if let Ok(ref d) = danmu {
            danmaku_cache::set_cache(&t, &el, d);
        }
        let count = danmu.as_ref().map(|d| d.len()).unwrap_or(0);
        eprintln!("[danmaku] background fetch done: {} items for '{}'", count, t);
    });

    // 3. 立即返回空，播放器秒开
    Ok(vec![])
}

/// 从自部署的 Cloudflare Workers 弹幕 API 获取弹幕
///
/// API 协议（huangxd-/danmu_api）：
///   GET /api/v2/search/anime?keyword={title}       → 搜索动漫
///   GET /api/v2/bangumi/{animeId}                   → 获取剧集列表
///   GET /api/v2/comment/{episodeId}?withRelated=true → 获取弹幕
///
/// 注意：该 API 有速率限制（默认 3 次/分钟），且可能返回非 JSON 响应（限流 HTML）。
///       所有错误/缺失弹幕均返回空列表而非 Err。
///       总超时 8 秒，超过则返回空（避免阻塞播放器初始化）。
async fn fetch_danmaku_from_workers(
    title: &str,
    episode_label: &str,
) -> Result<Vec<DanmuItem>, String> {
    use tokio::time::timeout;

    /// 发起 GET 请求，返回 JSON Value（非 200 或非 JSON 时返回 None）
    async fn try_get_json(
        client: &reqwest::Client,
        url: &str,
        timeout_secs: u64,
    ) -> Option<serde_json::Value> {
        let resp = client
            .get(url)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let text = resp.text().await.ok()?;
        serde_json::from_str(&text).ok()
    }

    async fn inner(
        title: &str,
        episode_label: &str,
    ) -> Result<Vec<DanmuItem>, String> {
        let base = DANMAKU_WORKERS_BASE;
        let label = "workers";

        // ── 1. 搜索动漫 ──
        let encoded_title = urlencode(title);
        let search_url = format!("{}/api/v2/search/anime?keyword={}", base, encoded_title);
        let body = match try_get_json(&DANMAKU_CLIENT, &search_url, 15).await {
            Some(b) => b,
            None => {
                eprintln!("[{}] search failed for '{}'", label, title);
                return Ok(vec![]);
            }
        };
        let animes = match body["animes"].as_array() {
            Some(a) if !a.is_empty() => a,
            _ => {
                eprintln!("[{}] no animes for '{}'", label, title);
                return Ok(vec![]);
            }
        };
        let anime_id = match animes[0]["animeId"].as_i64() {
            Some(id) => id,
            None => {
                eprintln!("[{}] missing animeId for '{}'", label, title);
                return Ok(vec![]);
            }
        };
        eprintln!("[{}] matched anime_id={} for '{}'", label, anime_id, title);

        // 短暂间隔，缓解限流
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        // ── 2. 获取剧集列表 ──
        let bangumi_url = format!("{}/api/v2/bangumi/{}", base, anime_id);
        let bg_body = match try_get_json(&DANMAKU_CLIENT, &bangumi_url, 10).await {
            Some(b) => b,
            None => {
                eprintln!("[{}] bangumi failed for anime_id={}", label, anime_id);
                return Ok(vec![]);
            }
        };
        let episodes = match bg_body["bangumi"]["episodes"].as_array() {
            Some(e) => e,
            None => {
                eprintln!("[{}] no episodes in bangumi for anime_id={}", label, anime_id);
                return Ok(vec![]);
            }
        };
        eprintln!(
            "[{}] '{}' → {} episodes in bangumi",
            label, title, episodes.len()
        );

        // 匹配剧集
        let target_num = extract_episode_num(episode_label);
        let matched = if let Some(num) = target_num {
            episodes
                .iter()
                .find(|ep| {
                    // episodeNumber 可能是字符串 "1" 或数字 1
                    ep["episodeNumber"]
                        .as_str()
                        .and_then(|s| s.parse::<i64>().ok())
                        .or_else(|| ep["episodeNumber"].as_i64())
                        == Some(num as i64)
                })
                .or_else(|| episodes.first())
        } else {
            episodes.first()
        };
        let episode = match matched {
            Some(e) => e,
            None => {
                eprintln!("[{}] no matching episode for '{}'", label, episode_label);
                return Ok(vec![]);
            }
        };
        let episode_id = match episode["episodeId"].as_i64() {
            Some(id) => id,
            None => {
                eprintln!("[{}] missing episodeId", label);
                return Ok(vec![]);
            }
        };
        eprintln!(
            "[{}] matched episode_id={} for ep='{}'",
            label, episode_id, episode_label
        );

        // 间隔，缓解限流
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        // ── 3. 获取弹幕 ──
        let comment_url = format!(
            "{}/api/v2/comment/{}?withRelated=true",
            base, episode_id
        );
        let cmt_body = match try_get_json(&DANMAKU_CLIENT, &comment_url, 15).await {
            Some(b) => b,
            None => {
                eprintln!(
                    "[{}] comment failed for episode_id={} (rate-limited or no data)",
                    label, episode_id
                );
                return Ok(vec![]);
            }
        };
        let comments = match cmt_body["comments"].as_array() {
            Some(c) => c,
            None => {
                eprintln!("[{}] no comments array", label);
                return Ok(vec![]);
            }
        };

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
                // dandanplay mode → artplayer-plugin-danmuku mode 映射
                //   1(滚动) → 0, 4(底部) → 2, 5(顶部) → 1
                let mode = match parts.get(1).and_then(|s| s.parse::<i32>().ok()) {
                    Some(4) => 2,
                    Some(5) => 1,
                    _ => 0, // 1(滚动)、6(逆向滚动)、未知 → 0(滚动)
                };
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
            label, title, episode_label, anime_id, episode_id, danmu.len()
        );
        Ok(danmu)
    }

    // 总超时 8 秒，超过则返回空（避免阻塞播放器初始化）
    match timeout(std::time::Duration::from_secs(8), inner(title, episode_label)).await {
        Ok(Ok(d)) => Ok(d),
        Ok(Err(_)) => Ok(vec![]),
        Err(_) => {
            eprintln!("[workers] timeout (8s) for '{}' ep='{}'", title, episode_label);
            Ok(vec![])
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 应用入口
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|_app| {
            // 启动本地视频代理（非阻塞）
            tauri::async_runtime::spawn(async {
                let _ = proxy::start().await;
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
