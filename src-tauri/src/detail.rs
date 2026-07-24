// ═══════════════════════════════════════════════════════════════════════════════
// 详情：主源立即返回 + 跨源聚合
// ═══════════════════════════════════════════════════════════════════════════════

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::client::CLIENT;
use crate::models::{
    AppleCmsResponse, SourceDef, SourceGroup, VideoDetail,
};
use crate::parser::{
    normalize_title, parse_episodes, parse_source_groups, resolve_poster, urlencode,
};
use crate::source_handlers;
use crate::sources::collect_priority;

/// 获取视频详情（含跨源剧集聚合）
#[tauri::command]
pub async fn get_video_detail(
    source_name: String,
    api_url: String,
    video_id: String,
) -> Result<VideoDetail, String> {
    if api_url.is_empty() {
        return Err("NO_PLAY_URL".into());
    }
    let base = api_url.trim_end_matches('/');

    // 1. 主源详情（必须成功）
    let mut detail = fetch_single_detail(&source_name, base, &video_id, &api_url).await?;
    let title = detail.title.clone();

    // 2. 跨源聚合：内置源优先，TVBox 源次之
    let all_sources = crate::sources::collect_sources().await;
    let mut seen_names: std::collections::HashSet<String> =
        detail.source_groups.iter().map(|g| g.source_name.clone()).collect();

    let cross_sources: Vec<&SourceDef> = all_sources
        .iter()
        .filter(|src| {
            src.name != source_name && src.url.trim_end_matches('/') != base
        })
        .collect();

    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_for_priority = cancelled.clone();

    let cross_results = collect_priority(
        &cross_sources.iter().map(|s| (*s).clone()).collect::<Vec<_>>(),
        |src| {
            let s_name = src.name.clone();
            let s_url = src.url.clone();
            let t = title.clone();
            let c = cancelled.clone();
            tokio::spawn(async move {
                // 超时后被取消，不再继续请求
                if c.load(Ordering::Relaxed) {
                    return (s_name.clone(), vec![]);
                }
                let groups = fetch_source_detail_impl(&s_name, &s_url, &t).await;
                (s_name.clone(), groups)
            })
        },
        std::time::Duration::from_secs(2),
        std::time::Duration::from_secs(2),
        Some(cancelled_for_priority),
    )
    .await;

    for (_s_name, groups) in cross_results {
        for g in groups {
            if !seen_names.contains(&g.source_name) {
                detail.source_groups.push(g.clone());
                seen_names.insert(g.source_name.clone());
            }
        }
    }

    // 更新扁平剧集列表
    let mut all_eps = Vec::new();
    for g in &detail.source_groups {
        all_eps.extend(g.episodes.clone());
    }
    detail.episodes = all_eps;

    eprintln!(
        "[detail] '{}' → {} source groups ({} crossed in time)",
        title,
        detail.source_groups.len(),
        detail.source_groups.len().saturating_sub(1)
    );
    Ok(detail)
}

/// 从单个源获取详情
async fn fetch_single_detail(
    source_name: &str,
    base: &str,
    video_id: &str,
    api_url: &str,
) -> Result<VideoDetail, String> {
    // 通过源处理器获取该平台特有的详情 URL 列表（含 fallback pattern）
    let handler = source_handlers::get_handler(api_url);
    let paths = handler.build_detail_urls(base, video_id);
    for path in &paths {
        let resp = match CLIENT.get(path).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };
        let text =
            String::from_utf8_lossy(&resp.bytes().await.unwrap_or_default()).to_string();
        eprintln!("[detail] '{}' response: {}B", source_name, text.len());

        if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
            if let Some(list) = ac.list {
                if let Some(item) = list.into_iter().next() {
                    let from = item.vod_play_from.unwrap_or_default();
                    let urls = item.vod_play_url.unwrap_or_default();
                    let episodes = parse_episodes(&from, &urls);
                    let source_groups = parse_source_groups(&from, &urls);
                    return Ok(VideoDetail {
                        id: item.vod_id.unwrap_or_default(),
                        title: item.vod_name.unwrap_or_default(),
                        poster: resolve_poster(&item.vod_pic.unwrap_or_default(), api_url),
                        description: item.vod_content.unwrap_or_default(),
                        source_name: source_name.to_string(),
                        episodes,
                        source_groups,
                    });
                }
            }
        }
        if text.trim().starts_with('<') {
            if let Ok(rss) = quick_xml::de::from_str::<crate::models::RssResponse>(&text) {
                if let Some(list) = rss.rss.and_then(|r| r.list) {
                    let items = match list.video {
                        Some(v) => v.into_vec(),
                        None => vec![],
                    };
                    if let Some(ref v) = items.first() {
                        let episodes = crate::parser::extract_xml_episodes(v);
                        return Ok(VideoDetail {
                            id: v.id.clone().unwrap_or_default(),
                            title: v.name.clone().unwrap_or_default(),
                            poster: resolve_poster(&v.pic.clone().unwrap_or_default(), api_url),
                            description: v.des.clone().unwrap_or_default(),
                            source_name: source_name.to_string(),
                            episodes: episodes.clone(),
                            source_groups: vec![SourceGroup {
                                source_name: source_name.to_string(),
                                episodes,
                            }],
                        });
                    }
                }
            }
        }
    }
    Err(format!("NOT_FOUND: no detail for {} @ {}", video_id, source_name))
}

/// 按标题在指定源中搜索视频并返回其剧集分组（内部实现）
async fn fetch_source_detail_impl(
    source_name: &str,
    api_url: &str,
    keyword: &str,
) -> Vec<SourceGroup> {
    let encoded = urlencode(keyword);
    let search_url = format!(
        "{}/?ac=list&wd={}&pagesize=5",
        api_url.trim_end_matches('/'),
        encoded
    );
    let resp = match CLIENT.get(&search_url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return vec![],
    };
    let text = match resp.text().await {
        Ok(t) => t,
        _ => return vec![],
    };
    let ac: AppleCmsResponse = match serde_json::from_str(&text) {
        Ok(a) => a,
        _ => return vec![],
    };
    let list = match ac.list {
        Some(l) => l,
        None => return vec![],
    };

    let norm_title = normalize_title(keyword);
    for item in &list {
        let item_title = item.vod_name.as_deref().unwrap_or("");
        if normalize_title(item_title) != norm_title {
            continue;
        }
        let vid = match &item.vod_id {
            Some(id) => id.clone(),
            None => continue,
        };
        let detail_url = format!(
            "{}/?ac=detail&ids={}",
            api_url.trim_end_matches('/'),
            vid
        );
        if let Ok(resp) = CLIENT.get(&detail_url).send().await {
            if let Ok(text) = resp.text().await {
                if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
                    if let Some(list) = ac.list {
                        if let Some(item) = list.into_iter().next() {
                            let from = item.vod_play_from.unwrap_or_default();
                            let urls = item.vod_play_url.unwrap_or_default();
                            let mut groups = parse_source_groups(&from, &urls);
                            if groups.is_empty() {
                                let eps = parse_episodes(&from, &urls);
                                if !eps.is_empty() {
                                    groups.push(SourceGroup {
                                        source_name: source_name.to_string(),
                                        episodes: eps,
                                    });
                                }
                            }
                            return groups;
                        }
                    }
                }
            }
        }
        break;
    }
    vec![]
}

/// 按标题在指定源中搜索视频并返回其剧集分组（Tauri 命令，按需查询）
#[tauri::command]
pub async fn fetch_source_detail(
    keyword: String,
    source_name: String,
    api_url: String,
) -> Vec<SourceGroup> {
    fetch_source_detail_impl(&source_name, &api_url, &keyword).await
}
