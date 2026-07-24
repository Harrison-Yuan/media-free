// ═══════════════════════════════════════════════════════════════════════════════
// 量子资源 - 平台参数映射
//
// 官方名称：量子资源
// URL 前缀：cj.lziapi.com
// 协议：Apple CMS v10
//
// 特性：
//   - 分页参数：pagesize（单页 12 条）
//   - limit 参数无效
//   - 扩展分类：短剧 type_id=46（独立分类，type_pid=0）
// ═══════════════════════════════════════════════════════════════════════════════

use crate::mapping::SourceConfig;

/// 量子资源平台配置列表
pub const PLATFORM_CONFIGS: &[SourceConfig] = &[SourceConfig {
    url_prefix: "cj.lziapi.com",
    page_size_param: "pagesize",
    default_page_size: 12,
    categories: &[(46, "短剧")],
}];
