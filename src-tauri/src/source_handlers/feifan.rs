// ═══════════════════════════════════════════════════════════════════════════════
// 非凡资源 - 平台参数映射
//
// 官方名称：非凡资源
// URL 前缀：cj.ffzyapi.com
// 协议：Apple CMS v10
//
// 特性：
//   - 分页参数：pagesize（单页 12 条），limit 无效
//   - 扩展分类：短剧 type_id=36（连续剧子分类，type_pid=2）
// ═══════════════════════════════════════════════════════════════════════════════

use crate::mapping::SourceConfig;

/// 非凡资源平台配置列表
pub const PLATFORM_CONFIGS: &[SourceConfig] = &[SourceConfig {
    url_prefix: "cj.ffzyapi.com",
    page_size_param: "pagesize",
    default_page_size: 12,
    categories: &[(36, "短剧")],
}];
