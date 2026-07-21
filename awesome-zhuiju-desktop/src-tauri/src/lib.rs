mod models;

use models::*;
use std::sync::LazyLock;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap()
});

/// Apple CMS 源（来自 resources.json 中的在线影视站）
/// 这些站点通常运行苹果CMS/海洋CMS，API 路径为 /api.php/provide/vod/
static CMS_SOURCES: LazyLock<Vec<(&str, &str)>> = LazyLock::new(|| {
    vec![
        ("泥视频", "https://www.nivod.vip"),
        ("PPnix", "https://www.ppnix.com"),
        ("Auete影视", "https://www.aeete.com"),
        ("电影人生", "https://dyrs.tv"),
        ("APP影院", "https://www.appmovie.art"),
        ("独播库", "https://www.dbku.tv"),
        ("雪落影视", "https://xlys.me"),
        ("爱壹帆", "https://iyf.tv"),
        ("青空次元", "https://www.sorani.net"),
        ("No影视", "https://novipnoad.org"),
    ]
});

/// TVBox 配置中的已知 type=1 (XML API) 源
static API_SOURCES: LazyLock<Vec<(&str, &str)>> = LazyLock::new(|| {
    vec![
        ("小胡", "http://xh1.xn--yetu07f.icu/api.php/provide/vod/"),
        ("饭太硬", "http://www.饭太硬.net/api.php/provide/vod/"),
    ]
});

#[tauri::command]
async fn search_video(keyword: String) -> Result<SearchResponse, String> {
    let encoded = urlencoding(&keyword);
    let mut all_items = Vec::new();
    let mut sources_used = 0usize;

    // 1. 搜索所有 Apple CMS 源
    for &(name, base_url) in CMS_SOURCES.iter() {
        let api_url = format!("{}/api.php/provide/vod/?ac=search&wd={}", base_url.trim_end_matches('/'), encoded);
        match search_single_source(name, base_url, &api_url).await {
            Ok(mut items) => {
                if !items.is_empty() {
                    sources_used += 1;
                    all_items.append(&mut items);
                }
            }
            Err(_) => {}
        }
    }

    // 2. 搜索已知 TVBox API
    for &(name, api) in API_SOURCES.iter() {
        let search_url = format!("{}?ac=search&wd={}", api.trim_end_matches('/'), encoded);
        match search_single_source(name, api, &search_url).await {
            Ok(mut items) => {
                if !items.is_empty() {
                    sources_used += 1;
                    all_items.append(&mut items);
                }
            }
            Err(_) => {}
        }
    }

    // 去重
    all_items.sort_by(|a, b| b.name.len().cmp(&a.name.len()));
    all_items.dedup_by(|a, b| a.name == b.name);

    Ok(SearchResponse {
        total: all_items.len(),
        sources: sources_used,
        items: all_items,
    })
}

async fn search_single_source(name: &str, base_url: &str, url: &str) -> Result<Vec<SearchItem>, String> {
    let resp = CLIENT.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let text = String::from_utf8_lossy(&resp.bytes().await.map_err(|e| e.to_string())?).to_string();
    if text.trim().is_empty() {
        return Err("empty".to_string());
    }

    // 尝试 JSON（Apple CMS 标准格式）
    if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
        if let Some(list) = ac.list {
            let items: Vec<SearchItem> = list.into_iter()
                .map(|item| SearchItem {
                    id: item.vod_id.unwrap_or_default(),
                    name: item.vod_name.unwrap_or_default(),
                    pic: item.vod_pic.unwrap_or_default(),
                    note: item.vod_remarks.unwrap_or_default(),
                    source_url: base_url.to_string(),
                    source_name: name.to_string(),
                })
                .filter(|v| !v.name.is_empty())
                .collect();
            if !items.is_empty() {
                return Ok(items);
            }
        }
    }

    // 尝试 XML（RSS 格式）
    if text.trim().starts_with('<') {
        if let Ok(rss) = quick_xml::de::from_str::<RssResponse>(&text) {
            if let Some(list) = rss.rss.and_then(|r| r.list) {
                let items = match list.video {
                    Some(v) => v.into_vec(),
                    None => vec![],
                };
                let result: Vec<SearchItem> = items.into_iter()
                    .map(|v| SearchItem {
                        id: v.id.unwrap_or_default(),
                        name: v.name.unwrap_or_default(),
                        pic: v.pic.unwrap_or_default(),
                        note: v.note.unwrap_or_default(),
                        source_url: base_url.to_string(),
                        source_name: name.to_string(),
                    })
                    .filter(|v| !v.name.is_empty())
                    .collect();
                if !result.is_empty() {
                    return Ok(result);
                }
            }
        }
    }

    Err(format!("unparseable ({} bytes)", text.len()))
}

#[tauri::command]
async fn get_video_detail(source_url: String, source_name: String, video_id: String) -> Result<VideoDetail, String> {
    let api_url = format!("{}/api.php/provide/vod/?ac=detail&ids={}", source_url.trim_end_matches('/'), video_id);
    let resp = CLIENT.get(&api_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let text = String::from_utf8_lossy(&resp.bytes().await.map_err(|e| e.to_string())?).to_string();

    // JSON 格式
    if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
        if let Some(list) = ac.list {
            if let Some(item) = list.into_iter().next() {
                let play_urls = parse_play_urls(&item.vod_play_url.unwrap_or_default());
                return Ok(VideoDetail {
                    id: item.vod_id.unwrap_or_default(),
                    name: item.vod_name.unwrap_or_default(),
                    pic: item.vod_pic.unwrap_or_default(),
                    desc: item.vod_content.unwrap_or_default(),
                    source_name,
                    play_urls,
                });
            }
        }
    }

    // XML 格式
    if text.trim().starts_with('<') {
        if let Ok(rss) = quick_xml::de::from_str::<RssResponse>(&text) {
            if let Some(list) = rss.rss.and_then(|r| r.list) {
                let items = match list.video {
                    Some(v) => v.into_vec(),
                    None => vec![],
                };
                if let Some(v) = items.into_iter().next() {
                    let play_urls = extract_xml_play_urls(&v);
                    return Ok(VideoDetail {
                        id: v.id.unwrap_or_default(),
                        name: v.name.unwrap_or_default(),
                        pic: v.pic.unwrap_or_default(),
                        desc: v.des.unwrap_or_default(),
                        source_name,
                        play_urls,
                    });
                }
            }
        }
    }

    Err("未找到视频详情".to_string())
}

#[tauri::command]
async fn check_sources() -> Result<HealthResponse, String> {
    let mut working = 0usize;
    let mut details = Vec::new();

    for &(name, base_url) in CMS_SOURCES.iter() {
        let test_url = format!("{}/api.php/provide/vod/?ac=list&pg=1&pagesize=1", base_url.trim_end_matches('/'));
        match CLIENT.get(&test_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                working += 1;
                details.push(format!("✅ {} ({})", name, resp.status()));
            }
            Ok(resp) => {
                details.push(format!("❌ {} (HTTP {})", name, resp.status()));
            }
            Err(e) => {
                details.push(format!("❌ {} ({})", name, e));
            }
        }
    }

    Ok(HealthResponse {
        sources: CMS_SOURCES.len(),
        working,
        details,
    })
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

fn extract_xml_play_urls(v: &VideoXml) -> Vec<PlayUrl> {
    if let Some(ref dl) = v.dl {
        if let Some(ref dd) = dl.dd {
            return dd.clone().extract()
                .into_iter().filter_map(|d| d.value)
                .flat_map(|val| parse_dd_value(&val))
                .collect();
        }
    }
    if let Some(ref url) = v.url {
        if !url.is_empty() {
            return vec![PlayUrl { name: "播放".into(), url: url.clone() }];
        }
    }
    vec![]
}

fn parse_dd_value(value: &str) -> Vec<PlayUrl> {
    value.trim().split('#').filter_map(|part| {
        let p = part.trim();
        if p.is_empty() { return None; }
        if let Some((n, u)) = p.split_once('$') {
            Some(PlayUrl { name: n.trim().into(), url: u.trim().into() })
        } else {
            Some(PlayUrl { name: "播放".into(), url: p.into() })
        }
    }).collect()
}

fn parse_play_urls(s: &str) -> Vec<PlayUrl> {
    if s.is_empty() { return vec![]; }
    s.split('#').filter_map(|part| {
        let p = part.trim();
        if p.is_empty() { return None; }
        if let Some((n, u)) = p.split_once('$') {
            Some(PlayUrl { name: n.trim().into(), url: u.trim().into() })
        } else {
            Some(PlayUrl { name: "全集".into(), url: p.into() })
        }
    }).collect()
}

fn urlencoding(s: &str) -> String {
    let mut r = String::with_capacity(s.len() * 3);
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => r.push(c),
            ' ' => r.push_str("%20"),
            _ => { for b in c.to_string().bytes() { r.push_str(&format!("%{:02X}", b)); } }
        }
    }
    r
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            search_video,
            get_video_detail,
            check_sources,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
