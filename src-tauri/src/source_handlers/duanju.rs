// ═══════════════════════════════════════════════════════════════════════════════
// 短剧资源 - 平台参数映射
//
// 官方名称：短剧资源
// URL 前缀：duanjuzy.com
// 协议：Apple CMS v10
//
// 特性：
//   - 分页参数：pagesize（单页 12 条）
//   - 扩展分类：短剧 type_id=5（短剧专用源，type_id=5 对应短剧）
// ═══════════════════════════════════════════════════════════════════════════════

use crate::mapping::SourceConfig;

/// 短剧资源平台配置列表
pub const PLATFORM_CONFIGS: &[SourceConfig] = &[SourceConfig {
    url_prefix: "duanjuzy.com",
    page_size_param: "pagesize",
    default_page_size: 12,
    categories: &[(5, "短剧")],
}];
