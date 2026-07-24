// ═══════════════════════════════════════════════════════════════════════════════
// Apple CMS 处理器
//
// 标准 Apple CMS v10 资源平台处理器。
// 覆盖大多数视频采集站（量子、非凡、红牛、短剧资源等）。
//
// URL 格式：
//   {base}/?ac=list&wd={keyword}&t={type_id}&pg={page}&{ps_param}={ps_val}&area={area}&year={year}
// ═══════════════════════════════════════════════════════════════════════════════

use crate::mapping::{SearchUrlParams, SourceConfig};
use super::SourceHandler;

/// Apple CMS 标准配置（空列表 — 具体平台参数在各平台独立文件中定义）
/// 未匹配到任何平台文件的源将使用 handler 默认值（pagesize=20）
pub const PLATFORM_CONFIGS: &[SourceConfig] = &[];

/// Apple CMS 处理器实例
pub struct AppleCmsHandler;

impl SourceHandler for AppleCmsHandler {
    fn build_list_url(&self, base: &str, config: Option<&SourceConfig>, params: &SearchUrlParams) -> String {
        let mut url = format!("{}/?ac=list", base.trim_end_matches('/'));

        if !params.keyword.is_empty() {
            url.push_str(&format!("&wd={}", params.keyword));
        }
        if let Some(t) = params.type_id {
            url.push_str(&format!("&t={}", t));
        }
        url.push_str(&format!("&pg={}", params.page));

        // 分页参数：优先使用源配置，默认 pagesize=20
        let (ps_param, ps_val) = match config {
            Some(cfg) if !cfg.page_size_param.is_empty() => (cfg.page_size_param, cfg.default_page_size),
            _ => ("pagesize", 20),
        };
        url.push_str(&format!("&{}={}", ps_param, ps_val));

        // 筛选参数（不支持的源会自动忽略）
        if let Some(ref a) = params.area {
            if !a.is_empty() {
                url.push_str(&format!("&area={}", a));
            }
        }
        if let Some(y) = params.year {
            url.push_str(&format!("&year={}", y));
        }

        url
    }

    fn build_detail_urls(&self, base: &str, video_id: &str) -> Vec<String> {
        let base = base.trim_end_matches('/');
        vec![
            // Pattern 1: 标准格式
            format!("{}/?ac=detail&ids={}", base, video_id),
            // Pattern 2: 无尾部斜杠
            format!("{}?ac=detail&ids={}", base, video_id),
        ]
    }
}
