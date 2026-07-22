// ═══════════════════════════════════════════════════════════════════════════════
// 分类-源映射管理
//
// 每个源可能有不同的 type_id 对应同一分类名称（如"电影"），
// 本模块维护 type_name → {source_url → type_id} 的按源映射，
// 确保搜索时各源使用各自对应的 type_id 查询。
//
// 映射来源：
//   - mapping.rs 提供静态基础映射（核心分类 + per-source 扩展 + 别名）
//   - 运行时动态查询各源 class 接口，补充静态映射未覆盖的分类
//
// 别名处理：源可能返回"连续剧"（官方标准名），我们显示为"电视剧"，
//   resolve_display_name() 负责从原始名到显示名的转换。
// ═══════════════════════════════════════════════════════════════════════════════

use crate::client::CLIENT;
use crate::mapping;
use crate::models::{AppleCmsResponse, SourceDef};

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

// ─── 核心映射缓存 ─────────────────────────────────────────────────────────

/// 分类-按源映射：type_name → {source_url → 该源对应的 type_id}
///
/// type_name 是标准显示名（如"电视剧"，而非原始名"连续剧"）。
/// source_url 是源的完整 api_base URL（如 "https://cj.lziapi.com/api.php/provide/vod/at/json"）。
static CATEGORY_PER_SOURCE: OnceLock<Mutex<HashMap<String, HashMap<String, i32>>>> =
    OnceLock::new();

fn init_cache() {
    CATEGORY_PER_SOURCE.get_or_init(|| Mutex::new(HashMap::new()));
}

/// 判断 URL 是否匹配 source_url_prefix
fn url_matches_prefix(source_url: &str, prefix: &str) -> bool {
    if prefix.is_empty() { return true; } // 空前缀通配所有
    source_url.contains(prefix)
}

/// 从 per-source map 中找到匹配给定 source_url 的 type_id
fn find_type_id_for_url(map: &HashMap<String, i32>, source_url: &str) -> Option<i32> {
    // 1. 精确匹配
    if let Some(&tid) = map.get(source_url) {
        return if tid == 0 { None } else { Some(tid) }; // 0 标记排除
    }
    // 2. 前缀匹配（per-source 扩展使用 URL 前缀）
    for (key, &tid) in map {
        if !key.is_empty() && tid != 0 && url_matches_prefix(source_url, key) {
            return Some(tid);
        }
    }
    // 3. 空 key 通配
    if let Some(&tid) = map.get("") {
        return if tid == 0 { None } else { Some(tid) };
    }
    None
}

/// 从 type_id 反查 type_name（先查静态映射，再查缓存）
pub fn lookup_cat_name(type_id: i32) -> Option<String> {
    // 先从 CORE_CATEGORIES 查
    for (id, name) in mapping::CORE_CATEGORIES {
        if *id == type_id {
            return Some(name.to_string());
        }
    }
    // 查 PER_SOURCE_CONFIGS 的扩展分类
    for cfg in mapping::PER_SOURCE_CONFIGS {
        for (tid, tname) in cfg.categories {
            if *tid == type_id {
                return Some(tname.to_string());
            }
        }
    }
    // 查 FALLBACK_EXTENDED
    for (tid, tname) in mapping::FALLBACK_EXTENDED {
        if *tid == type_id {
            return Some(tname.to_string());
        }
    }
    // 再查运行时缓存（动态发现的分类）
    let cache = CATEGORY_PER_SOURCE.get()?;
    let guard = cache.lock().ok()?;
    for (name, src_map) in guard.iter() {
        if src_map.values().any(|&tid| tid == type_id) {
            return Some(name.clone());
        }
    }
    None
}

/// 获取指定分类名称的 per-source type_id 映射
pub fn get_per_source_map(cat_name: &str) -> Option<HashMap<String, i32>> {
    let cache = CATEGORY_PER_SOURCE.get()?;
    let guard = cache.lock().ok()?;
    guard.get(cat_name).cloned()
}

/// 判断某源是否支持某分类
pub fn source_supports_category(source_url: &str, cat_name: &str) -> bool {
    let cache = CATEGORY_PER_SOURCE.get();
    let guard = match cache.and_then(|c| c.lock().ok()) {
        Some(g) => g,
        None => return true,
    };
    guard
        .get(cat_name)
        .map(|m| find_type_id_for_url(m, source_url).is_some())
        .unwrap_or(false)
}

/// 获取某源在某分类下的 type_id（用于搜索时构建 per-source 参数）
pub fn get_type_id_for_source(cat_name: &str, source_url: &str) -> Option<i32> {
    let cache = CATEGORY_PER_SOURCE.get();
    let guard = match cache.and_then(|c| c.lock().ok()) {
        Some(g) => g,
        None => return None,
    };
    guard
        .get(cat_name)
        .and_then(|m| find_type_id_for_url(m, source_url))
}

// ─── 构建映射（由 fetch_categories 调用） ────────────────────────────────

#[derive(Serialize, Clone)]
pub struct CatDisplayItem {
    pub type_id: i32,
    pub type_name: String,
    pub source_name: String,
}

static CAT_LIST_CACHE: OnceLock<Mutex<Vec<CatDisplayItem>>> = OnceLock::new();

pub fn get_cached_categories() -> Vec<CatDisplayItem> {
    CAT_LIST_CACHE
        .get()
        .and_then(|c| c.lock().ok().map(|g| g.clone()))
        .unwrap_or_default()
}

/// 构建全部分类映射（以 mapping.rs 静态映射为基础，动态发现补充）
pub async fn build_mapping(sources: &[SourceDef]) -> Vec<CatDisplayItem> {
    // ── 1. 从静态映射构建基础 per-source 映射 ──
    let mut per_src: HashMap<String, HashMap<String, i32>> = mapping::build_static_per_source();
    let mut cat_stats: HashMap<String, (u32, String)> = HashMap::new();
    for (_id, name) in mapping::CORE_CATEGORIES {
        cat_stats.entry(name.to_string()).or_insert((0, String::new()));
    }

    // ── 2. 动态发现：查询各源 class，补充静态映射未覆盖的分类 ──
    for src in sources {
        let url = format!("{}/?ac=list&t=1&pg=1&pagesize=1", src.url.trim_end_matches('/'));
        if let Ok(resp) = CLIENT.get(&url).send().await {
            if let Ok(text) = resp.text().await {
                if let Ok(ac) = serde_json::from_str::<AppleCmsResponse>(&text) {
                    if let Some(classes) = ac.class {
                        for c in classes {
                            let raw_name = c.type_name.trim().to_string();
                            if raw_name.is_empty() { continue; }
                            // 通过别名映射为标准显示名
                            let display_name = mapping::resolve_display_name(&raw_name).to_string();
                            let entry = cat_stats.entry(display_name.clone()).or_insert((0, src.name.clone()));
                            entry.0 += 1;
                            // 静态映射已覆盖的分类不覆盖（别名映射也算已覆盖）
                            if !per_src.contains_key(&display_name) {
                                per_src.entry(display_name.clone()).or_default().insert(src.url.clone(), c.type_id);
                            }
                        }
                    }
                }
            }
        }
        if cat_stats.len() >= 25 { break; }
    }

    // ── 3. 为核心分类填充每源具体 type_id ──
    for (tid, tname) in mapping::CORE_CATEGORIES {
        let name = tname.to_string();
        if let Some(src_map) = per_src.get_mut(&name) {
            // 移除通配符和别名标记
            src_map.retain(|k, v| !k.is_empty() && *v != 0);
            for src in sources {
                src_map.entry(src.url.clone()).or_insert(*tid);
            }
        }
    }

    // ── 4. 缓存 per-source 映射 ──
    init_cache();
    if let Some(cache) = CATEGORY_PER_SOURCE.get() {
        if let Ok(mut guard) = cache.lock() {
            *guard = per_src.clone();
        }
    }

    // ── 5. 输出格式化分类列表 ──
    let standard = ["电影", "电视剧", "综艺", "动漫", "短剧"];
    let mut out: Vec<CatDisplayItem> = cat_stats
        .into_iter()
        .filter(|(name, (count, _))| *count >= 2 || standard.contains(&name.as_str()))
        .map(|(type_name, (_, source_name))| {
            let tid = per_src
                .get(&type_name)
                .and_then(|m| m.values().find(|&&v| v != 0).copied())
                .unwrap_or(1);
            CatDisplayItem { type_id: tid, type_name, source_name }
        })
        .collect();
    out.sort_by_key(|c| standard.iter().position(|s| *s == c.type_name).unwrap_or(99));

    if let Ok(mut guard) = CAT_LIST_CACHE.get_or_init(|| Mutex::new(vec![])).lock() {
        *guard = out.clone();
    }

    out
}
