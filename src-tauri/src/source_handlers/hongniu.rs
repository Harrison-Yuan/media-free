// ═══════════════════════════════════════════════════════════════════════════════
// 红牛资源 - 平台参数映射
//
// 官方名称：红牛资源
// URL 前缀：hongniuzy2.com
// 协议：Apple CMS v10
//
// 特性：
//   - 分页参数：pagesize 和 limit 均有效（单页 12 条）
//   - 扩展分类：短剧 type_id=30（独立分类）
// ═══════════════════════════════════════════════════════════════════════════════

use crate::mapping::SourceConfig;

/// 红牛资源平台配置列表
pub const PLATFORM_CONFIGS: &[SourceConfig] = &[SourceConfig {
    url_prefix: "hongniuzy2.com",
    page_size_param: "pagesize",
    default_page_size: 12,
    categories: &[(30, "短剧")],
}];
