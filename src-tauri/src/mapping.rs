// ═══════════════════════════════════════════════════════════════════════════════
// Apple CMS 标准分类-源映射表
//
// # 数据来源
// 参考官方文档：https://github.com/magicblack/maccms10
// 实测各源 class 接口（2026-07）
//
// # 官方联盟资源分配 type_id（各源可自定义名称）:
//   1=电影, 2=连续剧, 3=综艺, 4=动漫
//   5=动作片(v7)/资讯(v10), 6=喜剧片, 7=爱情片, 8=科幻片, 9=恐怖片,
//  10=剧情片, 11=战争片, 12=国产剧, 13=港台剧, 14=日韩剧, 15=欧美剧
//
// # 关键差异（实测）
//   - 量子/非凡: type_id 1-4 名称"电影片/连续剧/综艺片/动漫片"
//   - 红牛: type_id 1-4 名称"电影/连续剧/综艺/动漫"
//   - "短剧" type_id 因源而异：量子=46, 非凡=36, 红牛=30
//   - 分页参数：量子忽略 limit/pagesize，红牛两者都支持，非凡仅 pagesize
//   - 返回值类型：量子/非凡用字符串，红牛用数值
// ═══════════════════════════════════════════════════════════════════════════════

use std::collections::HashMap;

// ─── 核心分类 ──────────────────────────────────────────────────────────────
//
// type_id 1-4 是所有 Apple CMS 源通用的一级标准分类。
// type_name 使用"电视剧"而非官方"连续剧"，因为这是用户习惯的中文说法。

pub const CORE_CATEGORIES: &[(i32, &str)] = &[
    (1, "电影"),
    (2, "电视剧"),
    (3, "综艺"),
    (4, "动漫"),
];

// ─── 分类别名 ──────────────────────────────────────────────────────────────
//
// 源返回的 raw class name ≠ 我们显示的名称，通过别名映射统一。

pub const CATEGORY_ALIASES: &[(&str, &str)] = &[
    ("连续剧", "电视剧"),   // 各源均返回"连续剧"，我们显示"电视剧"
    ("电影片", "电影"),     // 量子/非凡使用"电影片"
    ("综艺片", "综艺"),     // 量子/非凡使用"综艺片"
    ("动漫片", "动漫"),     // 量子/非凡使用"动漫片"
];

/// 获取标准显示名（通过别名反向查找）
pub fn resolve_display_name(raw_name: &str) -> &str {
    for (alias, display) in CATEGORY_ALIASES {
        if *alias == raw_name {
            return display;
        }
    }
    raw_name
}

// ─── Per-source 结构化配置 ────────────────────────────────────────────────
//
// 每个源可能有以下差异：
//   1. type_id 映射（核心1-4通用，扩展因源而异）
//   2. 分页参数名（pagesize / limit）
//   3. 默认页大小
//   4. 其他参数在扩展时加入

#[derive(Debug, Clone)]
pub struct SourceConfig {
    /// URL 前缀（contains 匹配）
    pub url_prefix: &'static str,
    /// 分页参数名（如 "pagesize"、"limit"、""=不支持）
    pub page_size_param: &'static str,
    /// 默认分页大小
    pub default_page_size: i32,
    /// 扩展分类映射：[(type_id, type_name)]
    /// 注意：核心分类（1-4）通用，不需要在此列出
    pub categories: &'static [(i32, &'static str)],
}

/// 各源配置（按 url_prefix 匹配）
/// 实测数据，勿随意修改
pub const PER_SOURCE_CONFIGS: &[SourceConfig] = &[
    SourceConfig {
        url_prefix: "cj.lziapi.com",       // 量子资源
        page_size_param: "pagesize",
        default_page_size: 12,
        categories: &[
            (46, "短剧"),                   // 实测：独立分类，type_pid=0
        ],
    },
    SourceConfig {
        url_prefix: "cj.ffzyapi.com",       // 非凡资源
        page_size_param: "pagesize",        // 实测：limit 无效，仅 pagesize 有效
        default_page_size: 12,
        categories: &[
            (36, "短剧"),                   // 实测：连续剧子分类，type_pid=2
        ],
    },
    SourceConfig {
        url_prefix: "hongniuzy2.com",       // 红牛资源
        page_size_param: "pagesize",        // 实测：limit 和 pagesize 均有效
        default_page_size: 12,
        categories: &[
            (30, "短剧"),                   // 实测：独立分类
        ],
    },
    SourceConfig {
        url_prefix: "duanjuzy.com",         // 短剧资源
        page_size_param: "pagesize",
        default_page_size: 12,
        categories: &[
            (5, "短剧"),                    // 推测：短剧专用源，type_id=5 对应短剧
        ],
    },
];

// ─── 通用默认扩展（兜底）─────────────────────────────────────────────────
//
// 当源未在 PER_SOURCE_CONFIGS 中列出时（如 TVBox 动态发现的源），
// 使用此默认映射。
// 注意：type_id=5 在官方标准中是"动作片"或"资讯"，不是"短剧"！
// 因此不在兜底中包含 type_id=5，由动态发现补充。

pub const FALLBACK_EXTENDED: &[(i32, &str)] = &[
    (6, "动作片"),
    (7, "喜剧片"),
    (8, "爱情片"),
    (9, "科幻片"),
    (10, "恐怖片"),
    (11, "剧情片"),
    (12, "战争片"),
    (13, "国产剧"),
    (14, "港台剧"),
    (15, "日韩剧"),
    (16, "欧美剧"),
];

// ─── 默认配置（用于未在 PER_SOURCE_CONFIGS 中列出的源） ─────────────────

pub const DEFAULT_PAGE_SIZE_PARAM: &str = "pagesize";
pub const DEFAULT_PAGE_SIZE: i32 = 99;

// ─── 按 URL 查找配置 ─────────────────────────────────────────────────────

/// 通过源 URL 查找对应的 SourceConfig
pub fn get_source_config(source_url: &str) -> Option<&'static SourceConfig> {
    PER_SOURCE_CONFIGS.iter().find(|cfg| source_url.contains(cfg.url_prefix))
}

/// 获取源的分页参数名
pub fn get_source_page_size_param(source_url: &str) -> &'static str {
    get_source_config(source_url)
        .map(|cfg| cfg.page_size_param)
        .filter(|p| !p.is_empty())
        .unwrap_or(DEFAULT_PAGE_SIZE_PARAM)
}

/// 获取源的默认分页大小
pub fn get_source_default_page_size(source_url: &str) -> i32 {
    get_source_config(source_url)
        .map(|cfg| cfg.default_page_size)
        .unwrap_or(DEFAULT_PAGE_SIZE)
}

/// 获取源的自定义 type_id 映射（核心分类之外）
pub fn get_source_category_mapping(source_url: &str) -> &'static [(i32, &'static str)] {
    get_source_config(source_url)
        .map(|cfg| cfg.categories)
        .unwrap_or(&[])
}

// ─── 构建 type_id 映射 ────────────────────────────────────────────────────

/// 获取所有标准分类列表（核心 + 扩展合并，仅用于参考）
pub fn get_standard_categories() -> Vec<(i32, String)> {
    let mut out: Vec<(i32, String)> = CORE_CATEGORIES
        .iter()
        .map(|(id, name)| (*id, name.to_string()))
        .collect();

    let mut seen: std::collections::HashSet<String> =
        out.iter().map(|(_, n)| n.clone()).collect();

    // 加入兜底扩展
    for (id, name) in FALLBACK_EXTENDED {
        if seen.insert(name.to_string()) {
            out.push((*id, name.to_string()));
        }
    }

    // 加入 per-source 扩展中非核心分类
    for cfg in PER_SOURCE_CONFIGS {
        for (id, name) in cfg.categories {
            if seen.insert(name.to_string()) {
                out.push((*id, name.to_string()));
            }
        }
    }

    out
}

/// 从 type_name 查找核心分类的 type_id
pub fn lookup_standard_type_id(type_name: &str) -> Option<i32> {
    for (id, name) in CORE_CATEGORIES {
        if *name == type_name {
            return Some(*id);
        }
    }
    None
}

/// 构建 per-source type_id 映射（基于静态映射）
///
/// 返回 type_name → {key → type_id}
/// key 可以是：
///   - "" 空字符串（通配所有源）
///   - URL 前缀（如 "cj.lziapi.com"，前缀匹配）
///   - 别名（如 "连续剧"，标记为 0 表示需要合并到核心分类）
pub fn build_static_per_source() -> HashMap<String, HashMap<String, i32>> {
    let mut result: HashMap<String, HashMap<String, i32>> = HashMap::new();

    // ── 核心分类（type_id 1-4）：所有源通用 ──
    for (tid, tname) in CORE_CATEGORIES {
        let entry = result.entry(tname.to_string()).or_default();
        entry.insert(String::new(), *tid);
    }

    // ── 别名映射 ──
    for (alias, display) in CATEGORY_ALIASES {
        let entry = result.entry(display.to_string()).or_default();
        entry.insert(alias.to_string(), 0); // 0 表示别名标记
    }

    // ── Per-source 扩展映射 ──
    for cfg in PER_SOURCE_CONFIGS {
        for (tid, tname) in cfg.categories {
            let entry = result.entry(tname.to_string()).or_default();
            if !entry.contains_key(cfg.url_prefix) {
                entry.insert(cfg.url_prefix.to_string(), *tid);
            }
        }
    }

    // ── 兜底扩展（type_id 6-16）：空 key 通配，由动态发现替代 ──
    for (tid, tname) in FALLBACK_EXTENDED {
        let entry = result.entry(tname.to_string()).or_default();
        entry.entry(String::new()).or_insert(*tid);
    }

    result
}
