// ═══════════════════════════════════════════════════════════════════════════════
// Apple CMS 标准分类 & 通用映射工具
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
//
// # 各平台参数映射
// 各源的具体参数（type_id 映射、分页参数等）已移至
// source_handlers/ 下各独立文件中维护，互不影响。
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
//   4. 处理器类型（platform 字段，默认 AppleCms）
//   5. 其他参数在扩展时加入

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

// ─── 搜索 URL 参数 ────────────────────────────────────────────────────────

/// 搜索请求参数（已 URL 编码），用于构建下游源的 API URL
/// 各源处理器（SourceHandler）接收此统一结构，转换为平台特有 URL
pub struct SearchUrlParams {
    pub keyword: String,
    pub type_id: Option<i32>,
    pub page: i32,
    pub area: Option<String>,
    pub year: Option<i32>,
}

// ─── 父子分类层级映射表 ────────────────────────────────────────────────
//
// 数据来源：Apple CMS 官方文档 https://www.kancloud.cn/pgcms/maccms/2405302
// type_id 1-4 是固定的一级分类 (type_pid=0)。
// 以下定义二级分类与其父分类的对应关系。
//
// 注意：
// - type_id=5 在官方标准 v10 中为"资讯"(v7 中为"动作片")，因源而异
//   不在本映射表中包含 type_id=5，由动态发现或 per-source 处理
// - 各 per-source 扩展（如短剧 type_id=30/36/46）不在此定义，
//   统一视为一级分类（type_pid=0）
//
// 用法：前端侧栏显示 type_pid=0 的一级分类，
//       筛选栏显示 get_subcategories(pid) 返回的二级分类

pub const PARENT_CATEGORY_MAP: &[(i32, i32, &str)] = &[
    // (type_id, parent_type_id, display_name)
    // ── 电影(1) 的子分类 ──
    (6, 1, "喜剧片"),
    (7, 1, "爱情片"),
    (8, 1, "科幻片"),
    (9, 1, "恐怖片"),
    (10, 1, "剧情片"),
    (11, 1, "战争片"),
    // ── 电视剧(2) 的子分类 ──
    (12, 2, "国产剧"),
    (13, 2, "港台剧"),
    (14, 2, "日韩剧"),
    (15, 2, "欧美剧"),
];

/// 获取指定一级分类的二级分类列表
pub fn get_subcategories(parent_type_id: i32) -> Vec<(i32, &'static str)> {
    PARENT_CATEGORY_MAP
        .iter()
        .filter(|(_, pid, _)| *pid == parent_type_id)
        .map(|(tid, _, name)| (*tid, *name))
        .collect()
}

/// 获取指定分类的父分类 type_id
/// - 返回 None 表示一级分类（type_pid=0）
/// - 返回 Some(pid) 表示二级分类，pid 为父分类 type_id
pub fn get_parent_type_id(type_id: i32) -> Option<i32> {
    if CORE_CATEGORIES.iter().any(|(id, _)| *id == type_id) {
        return None; // 明确的一级分类
    }
    PARENT_CATEGORY_MAP
        .iter()
        .find(|(tid, _, _)| *tid == type_id)
        .map(|(_, pid, _)| *pid)
}

// ─── 通用默认扩展（兜底）─────────────────────────────────────────────────
//
// 当源未在任何平台参数映射中列出时（如 TVBox 动态发现的源），
// 且动态发现未覆盖时，使用此默认映射提供基础分类支持。
//
// 注意：type_id=5 在官方标准中是"动作片"或"资讯"，不是"短剧"！
// 因此不在兜底中包含 type_id=5，由动态发现补充。

pub const FALLBACK_EXTENDED: &[(i32, &str)] = &[
    (6, "喜剧片"),
    (7, "爱情片"),
    (8, "科幻片"),
    (9, "恐怖片"),
    (10, "剧情片"),
    (11, "战争片"),
    (12, "国产剧"),
    (13, "港台剧"),
    (14, "日韩剧"),
    (15, "欧美剧"),
];

// ─── 按 URL 查找配置 ─────────────────────────────────────────────────────

/// 通过源 URL 查找对应的 SourceConfig（遍历所有已注册平台的参数映射）
pub fn get_source_config(source_url: &str) -> Option<&'static SourceConfig> {
    crate::source_handlers::all_configs()
        .into_iter()
        .find(|cfg| source_url.contains(cfg.url_prefix))
}

// ─── 构建 type_id 映射 ────────────────────────────────────────────────────

/// 构建 per-source type_id 映射（基于静态映射 + 各平台参数映射）
///
/// 参数 `per_source_configs` 接收各平台独立的 SourceConfig 列表，
/// 由调用者传入（通常来自 source_handlers::all_configs()）。
///
/// 返回 type_name → {key → type_id}
/// key 可以是：
///   - "" 空字符串（通配所有源）
///   - URL 前缀（如 "cj.lziapi.com"，前缀匹配）
///   - 别名（如 "连续剧"，标记为 0 表示需要合并到核心分类）
pub fn build_static_per_source(
    per_source_configs: &[&'static SourceConfig],
) -> HashMap<String, HashMap<String, i32>> {
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

    // ── Per-source 扩展映射（来自各平台独立配置） ──
    for cfg in per_source_configs {
        for (tid, tname) in cfg.categories {
            let entry = result.entry(tname.to_string()).or_default();
            if !entry.contains_key(cfg.url_prefix) {
                entry.insert(cfg.url_prefix.to_string(), *tid);
            }
        }
    }

    // ── 兜底扩展（type_id 6-15）：空 key 通配，由动态发现替代 ──
    for (tid, tname) in FALLBACK_EXTENDED {
        let entry = result.entry(tname.to_string()).or_default();
        entry.entry(String::new()).or_insert(*tid);
    }

    result
}
