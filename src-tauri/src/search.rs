// ═══════════════════════════════════════════════════════════════════════════════
// 搜索：并发查询 + 事件推送增量结果
// ═══════════════════════════════════════════════════════════════════════════════

use crate::categories;
use crate::client::{is_source_healthy, mark_failure, mark_success, source_health_score, CLIENT};
use crate::mapping;
use crate::models::{
    AppleCmsResponse, RssResponse, SearchResult, SourceDef, SourceInfo, VideoItem,
};
use crate::parser::{normalize_title, parse_episodes, parse_source_groups, resolve_poster, urlencode};
use crate::source_handlers;
use crate::sources::is_builtin_source;

use std::time::Instant;
use tauri::Emitter;
use tokio::sync::mpsc;

/// 搜索结果增量更新事件 payload
#[derive(serde::Serialize, Clone)]
pub struct SearchUpdateEvent {
    pub items: Vec<VideoItem>,
    pub sources_responding: u32,
    pub elapsed_ms: u64,
}

/// 搜索视频（主命令）
///
/// Phase 1: 最快源有数据即返回（最多等 6s）
/// Phase 2: 后台持续收集慢源结果，通过事件推送
#[tauri::command]
pub async fn search_video(
    app_handle: tauri::AppHandle,
    keyword: String,
    type_id: Option<i32>,
    page: Option<i32>,
    area: Option<String>,
    year: Option<i32>,
) -> Result<SearchResult, String> {
    let kw = keyword.trim();
    let start = Instant::now();

    eprintln!(
        "[search] ENTER: keyword='{}'(len={}), type_id={:?}, page={:?}",
        kw,
        kw.len(),
        type_id,
        page
    );

    let all_sources = crate::sources::collect_sources().await;
    let mut sources: Vec<&SourceDef> =
        all_sources.iter().filter(|s| is_source_healthy(&s.url)).collect();

    eprintln!("[search] sources: {} total, {} healthy", all_sources.len(), sources.len());

    // 分类筛选
    let cat_name = type_id.and_then(|tid| categories::lookup_cat_name(tid));
    if let Some(ref name) = cat_name {
        let mut filtered: Vec<&SourceDef> = Vec::new();
        for s in &sources {
            if categories::source_supports_category(&s.url, name) {
                filtered.push(*s);
            }
        }
        sources = filtered;
    }

    let total_sources = sources.len() as u32;
    if total_sources == 0 {
        return Ok(SearchResult {
            items: vec![],
            elapsed_ms: 0,
            local: false,
            sources_total: 0,
            sources_responding: 0,
        });
    }

    let encoded = if kw.is_empty() {
        String::new()
    } else {
        urlencode(kw)
    };
    let pg = page.unwrap_or(1);

    /// 构建搜索 URL 列表
    let build_urls = |year_val: Option<i32>| -> Vec<(String, String, String)> {
        sources
            .iter()
            .map(|src| {
                let actual_tid = cat_name
                    .as_ref()
                    .and_then(|name| categories::get_type_id_for_source(name, &src.url))
                    .or(type_id);
                let params = mapping::SearchUrlParams {
                    keyword: encoded.clone(),
                    type_id: actual_tid,
                    page: pg,
                    area: area.as_ref().map(|a| urlencode(a)),
                    year: year_val,
                };
                let handler = source_handlers::get_handler(&src.url);
                let config = mapping::get_source_config(&src.url);
                let url = handler.build_list_url(&src.url, config, &params);

                eprintln!("[search] URL '{}': {}", src.name, url);

                (src.name.clone(), src.url.clone(), url)
            })
            .collect()
    };

    let search_urls = build_urls(year);
    eprintln!("[search] built {} search URLs", search_urls.len());

    // ── Channel: 所有源查询结果汇集于此 ──
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, Vec<VideoItem>)>();

    for (name, api_base, search_url) in &search_urls {
        let tx = tx.clone();
        let name = name.clone();
        let api_base = api_base.clone();
        let search_url = search_url.clone();
        tokio::spawn(async move {
            let result = fetch_source(&name, &search_url, &api_base).await;
            if let Ok(items) = result {
                if !items.is_empty() {
                    let _ = tx.send((name, items));
                }
            }
        });
    }
    drop(tx);

    // ── Phase 1: 收集首批结果 ──
    let mut items = Vec::new();
    let mut source_count = 0u32;
    let initial_deadline = tokio::time::sleep(std::time::Duration::from_secs(8));
    tokio::pin!(initial_deadline);

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Some((_, mut v)) => {
                        source_count += 1;
                        items.append(&mut v);
                        if source_count >= 1 { break; }
                    }
                    None => break,
                }
            }
            _ = &mut initial_deadline => break,
        }
    }

    // 超时后把已到达的都收进来
    loop {
        match rx.try_recv() {
            Ok((_, mut v)) => {
                source_count += 1;
                items.append(&mut v);
            }
            Err(_) => break,
        }
    }

    sort_and_dedup(&mut items);

    let initial_items = items.clone();
    let initial_len = initial_items.len();
    let elapsed = start.elapsed().as_millis() as u64;

    let result = SearchResult {
        items: initial_items,
        elapsed_ms: elapsed,
        local: false,
        sources_total: total_sources,
        sources_responding: source_count,
    };

    eprintln!(
        "[search] '{}'(t={:?},pg={}): {} 条(首批), {}个源, {}ms",
        kw,
        type_id,
        pg,
        result.items.len(),
        source_count,
        elapsed
    );

    // ── Phase 2: 后台收集 + 事件推送 ──
    let app = app_handle.clone();
    let kw_owned = kw.to_string();
    let tid = type_id;
    let pg2 = pg;
    tokio::spawn(async move {
        let mut all_items = items;
        let mut count = source_count;
        let start2 = Instant::now();

        while let Some((_, mut v)) = rx.recv().await {
            count += 1;
            all_items.append(&mut v);
            sort_and_dedup(&mut all_items);

            let new_count = all_items.len().saturating_sub(initial_len);
            if new_count > 0 {
                let new_slice: Vec<VideoItem> =
                    all_items.iter().skip(initial_len).take(new_count).cloned().collect();
                let _ = app.emit(
                    "search-update",
                    &SearchUpdateEvent {
                        items: new_slice,
                        sources_responding: count,
                        elapsed_ms: start2.elapsed().as_millis() as u64,
                    },
                );
            }
        }

        eprintln!(
            "[search] '{}'(t={:?},pg={}): 全部完成, {}个源, {}条",
            kw_owned,
            tid,
            pg2,
            count,
            all_items.len()
        );
    });

    Ok(result)
}

/// 从单个源获取搜索结果
async fn fetch_source(
    name: &str,
    url: &str,
    api_base: &str,
) -> Result<Vec<VideoItem>, String> {
    let resp = CLIENT.get(url).send().await.map_err(|e| {
        mark_failure(api_base);
        format!("[{}] {}", name, e)
    })?;
    if !resp.status().is_success() {
        mark_failure(api_base);
        return Err(format!("[{}] HTTP {}", name, resp.status()));
    }
    mark_success(api_base);
    let text =
        String::from_utf8_lossy(&resp.bytes().await.map_err(|e| format!("[{}] read: {}", name, e))?)
            .to_string();
    if text.trim().is_empty() {
        return Err(format!("[{}] empty", name));
    }

    eprintln!("[fetch] '{}' response: {}B", name, text.len());

    // 先验证是否为有效 JSON
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(_) => eprintln!("[fetch] '{}' raw JSON is valid", name),
        Err(e) => {
            eprintln!("[fetch] '{}' raw JSON INVALID: {}", name, e);
            eprintln!("[fetch] first 500 chars: {}", &text[..text.len().min(500)]);
        }
    }

    if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
        let list_len = ac.list.as_ref().map(|l| l.len()).unwrap_or(0);
        eprintln!("[fetch] '{}' JSON OK, list items: {}", name, list_len);
        if let Some(list) = ac.list {
            let out: Vec<VideoItem> = list
                .into_iter()
                .filter(|i| i.vod_name.as_deref().map_or(false, |n| !n.is_empty()))
                .map(|i| {
                    let from = i.vod_play_from.unwrap_or_default();
                    let urls = i.vod_play_url.unwrap_or_default();
                    let episodes = parse_episodes(&from, &urls);
                    let source_groups = parse_source_groups(&from, &urls);
                    let poster = resolve_poster(&i.vod_pic.unwrap_or_default(), api_base);
                    if poster.is_empty() {
                        eprintln!("[fetch] '{}' item '{}' has NO poster", name, i.vod_name.as_deref().unwrap_or("?"));
                    }
                    VideoItem {
                        id: i.vod_id.unwrap_or_default(),
                        title: i.vod_name.unwrap_or_default(),
                        poster,
                        remark: i.vod_remarks.unwrap_or_default(),
                        description: i.vod_content.unwrap_or_default(),
                        source: SourceInfo {
                            name: name.into(),
                            api_url: api_base.to_string(),
                        },
                        episodes,
                        source_groups,
                        hits: i.vod_hits.unwrap_or(0),
                        score: i.vod_score.unwrap_or(0.0),
                        year: i.vod_year.unwrap_or_default(),
                        area: i.vod_area.unwrap_or_default(),
                    }
                })
                .collect();
            if !out.is_empty() {
                eprintln!("[fetch] '{}' → {} VideoItems", name, out.len());
                return Ok(out);
            }
            eprintln!("[fetch] '{}' JSON: list present but all items filtered out or empty", name);
        }
    } else {
        let err = serde_json::from_str::<AppleCmsResponse>(&text).unwrap_err();
        eprintln!("[fetch] '{}' AppleCmsResponse parse error: {}", name, err);
        eprintln!("[fetch] trying XML...");
    }
    if text.trim().starts_with('<') {
        if let Ok(rss) = quick_xml::de::from_str::<RssResponse>(&text) {
            if let Some(list) = rss.rss.and_then(|r| r.list) {
                let xml = match list.video {
                    Some(v) => v.into_vec(),
                    None => vec![],
                };
                let out: Vec<VideoItem> = xml
                    .into_iter()
                    .filter(|v| v.name.as_deref().map_or(false, |n| !n.is_empty()))
                    .map(|v| VideoItem {
                        id: v.id.unwrap_or_default(),
                        title: v.name.unwrap_or_default(),
                        poster: resolve_poster(&v.pic.unwrap_or_default(), api_base),
                        remark: v.note.unwrap_or_default(),
                        description: String::new(),
                        source: SourceInfo {
                            name: name.into(),
                            api_url: api_base.to_string(),
                        },
                        episodes: vec![],
                        source_groups: vec![],
                        hits: 0,
                        score: 0.0,
                        year: String::new(),
                        area: String::new(),
                    })
                    .collect();
                if !out.is_empty() {
                    return Ok(out);
                }
            }
            eprintln!("[fetch] '{}' XML parse also failed", name);
        }
    }
    Err(format!("[{}] unparseable {}B", name, text.len()))
}

/// 排序：播放量 > 评分 > 有封面 > 内置源 > 标题短
/// 去重：同标题优先保留排在前面的
fn sort_and_dedup(items: &mut Vec<VideoItem>) {
    items.sort_by(|a, b| {
        let a_score = source_health_score(&a.source.api_url);
        let b_score = source_health_score(&b.source.api_url);
        let a_pic = !a.poster.is_empty();
        let b_pic = !b.poster.is_empty();
        let a_builtin = is_builtin_source(&a.source.name);
        let b_builtin = is_builtin_source(&b.source.name);
        b.hits
            .cmp(&a.hits)
            .then_with(|| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| b_score.cmp(&a_score))
            .then_with(|| b_pic.cmp(&a_pic))
            .then_with(|| b_builtin.cmp(&a_builtin))
            .then_with(|| a.title.len().cmp(&b.title.len()))
            .then_with(|| a.title.cmp(&b.title))
    });
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert(normalize_title(&item.title)));
}
