// ═══════════════════════════════════════════════════════════════════════════════
// 源处理器 + 平台参数映射 注册中心
//
// 每个资源平台的参数映射在独立文件中维护，互不影响。
// 本模块聚合所有平台的配置，供外部统一查询。
//
// 模块结构：
//   apple_cms.rs  — Apple CMS 标准处理器（默认，覆盖绝大多数源）
//   quantum.rs    — 量子资源 (cj.lziapi.com) 参数映射
//   feifan.rs     — 非凡资源 (cj.ffzyapi.com) 参数映射
//   hongniu.rs    — 红牛资源 (hongniuzy2.com) 参数映射
//   duanju.rs     — 短剧资源 (duanjuzy.com) 参数映射
//
// 新增平台步骤：
//   1. 在 source_handlers/ 下新建文件
//   2. 实现 SourceHandler trait（如需自定义 URL 构建）
//   3. 导出 pub const PLATFORM_CONFIGS: &[SourceConfig]
//   4. 在本模块中注册（加 mod + 加 all_configs 条目）
// ═══════════════════════════════════════════════════════════════════════════════

mod apple_cms;
mod duanju;
mod feifan;
mod hongniu;
mod quantum;

use crate::mapping::{SearchUrlParams, SourceConfig};

/// 源处理器 trait
///
/// 每个资源平台实现此 trait 以定义自己的：
///   - 列表查询 URL 格式
///   - 详情查询 URL 格式（支持多个 fallback）
///   - 响应解析方式（可选，默认使用 Apple CMS 标准格式）
pub trait SourceHandler: Send + Sync {
    /// 构建列表查询 URL
    fn build_list_url(&self, base: &str, config: Option<&SourceConfig>, params: &SearchUrlParams) -> String;

    /// 构建详情查询 URL 列表（依次尝试）
    fn build_detail_urls(&self, base: &str, video_id: &str) -> Vec<String>;
}

// ─── 平台类型枚举 ─────────────────────────────────────────────────────────

/// 平台类型枚举，每个枚举对应一个实现文件
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformKind {
    /// Apple CMS 标准（默认，覆盖绝大多数源）
    AppleCms,
}

/// 获取源所属的平台类型
pub fn platform_for_source(_source_url: &str) -> PlatformKind {
    // 目前所有内置源和 TVBox 发现的源均为 Apple CMS
    // 后续可在 platform 配置字段中扩展以区分不同平台
    PlatformKind::AppleCms
}

/// 获取源对应的处理器实例
pub fn get_handler(source_url: &str) -> &'static dyn SourceHandler {
    match platform_for_source(source_url) {
        PlatformKind::AppleCms => &apple_cms::AppleCmsHandler,
    }
}

// ─── 参数映射注册表 ─────────────────────────────────────────────────────
//
// 聚合所有平台的 SourceConfig，供 mapping::get_source_config() 查询。
// 每个平台的 PLATFORM_CONFIGS 是独立维护的静态常量。

/// 获取所有已注册平台的参数映射列表
pub fn all_configs() -> Vec<&'static SourceConfig> {
    let mut configs: Vec<&'static SourceConfig> = Vec::new();
    configs.extend(apple_cms::PLATFORM_CONFIGS.iter());
    configs.extend(quantum::PLATFORM_CONFIGS.iter());
    configs.extend(feifan::PLATFORM_CONFIGS.iter());
    configs.extend(hongniu::PLATFORM_CONFIGS.iter());
    configs.extend(duanju::PLATFORM_CONFIGS.iter());
    configs
}
