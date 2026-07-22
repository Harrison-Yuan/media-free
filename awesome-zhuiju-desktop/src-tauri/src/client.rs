// ═══════════════════════════════════════════════════════════════════════════════
// HTTP 客户端 & 源健康缓存
// ═══════════════════════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Instant;

/// 全局 HTTP 客户端
pub static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .connect_timeout(std::time::Duration::from_secs(8))
        .http1_only()
        .pool_max_idle_per_host(8)
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .danger_accept_invalid_certs(true)
        .build()
        .expect("reqwest::Client init failed")
});

/// 源健康状态
struct SourceHealth {
    fail_count: u32,
    last_attempt: Instant,
}

const MAX_FAILURES: u32 = 3;
const RETRY_INTERVAL_SECS: u64 = 300; // 5 分钟后重试死源

/// 源健康缓存：连续失败 N 次标记不可用，定期重试恢复
static HEALTH_CACHE: OnceLock<Mutex<HashMap<String, SourceHealth>>> = OnceLock::new();

fn with_health<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, SourceHealth>) -> R,
{
    let cache = HEALTH_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache.lock().expect("health cache lock");
    f(&mut *guard)
}

/// 判断源是否可查询（连续失败 < 3 或已过重试时间）
pub fn is_source_healthy(url: &str) -> bool {
    with_health(|cache| match cache.get(url) {
        None => true,
        Some(h) => {
            if h.fail_count >= MAX_FAILURES {
                h.last_attempt.elapsed() > std::time::Duration::from_secs(RETRY_INTERVAL_SECS)
            } else {
                true
            }
        }
    })
}

/// 标记源查询成功（重置失败计数）
pub fn mark_success(url: &str) {
    with_health(|cache| {
        cache.insert(
            url.to_string(),
            SourceHealth {
                fail_count: 0,
                last_attempt: Instant::now(),
            },
        );
    });
}

/// 标记源查询失败（递增失败计数）
pub fn mark_failure(url: &str) {
    with_health(|cache| {
        let entry = cache
            .entry(url.to_string())
            .or_insert(SourceHealth {
                fail_count: 0,
                last_attempt: Instant::now(),
            });
        entry.fail_count += 1;
        entry.last_attempt = Instant::now();
        eprintln!("[health] {} fail_count={}", url, entry.fail_count);
    });
}

/// 获取源的健康评分（0=不可用/3=可用），用于搜索结果排序
pub fn source_health_score(api_url: &str) -> u8 {
    with_health(|cache| match cache.get(api_url) {
        Some(h) if h.fail_count == 0 => 3,
        _ => 0,
    })
}
