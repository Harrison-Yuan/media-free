// ═══════════════════════════════════════════════════════════════════════════════
// 弹幕本地 SQLite 缓存
//
// 缓存策略：
//   - 键：SHA256("{title}||{episode_label}")
//   - 值：JSON 序列化的弹幕数组
//   - 过期时间：24 小时（可通过 CACHE_TTL_HOURS 调整）
//
// 效果：第二次播放同一集时，弹幕从本地读取，0 毫秒返回。
// ═══════════════════════════════════════════════════════════════════════════════

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::DanmuItem;

/// 缓存过期时间（小时）
const CACHE_TTL_HOURS: u64 = 24;

/// 全局数据库连接
static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

/// 获取数据库路径（~/.awesome-zhuiju/danmaku_cache.db）
fn db_path() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(home).join(".awesome-zhuiju");
    std::fs::create_dir_all(&dir).ok();
    dir.join("danmaku_cache.db")
}

/// 初始化数据库（建表）
fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS danmaku_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );",
    )
    .expect("Failed to create danmaku_cache table");
}

/// 获取或初始化全局数据库连接
fn get_db() -> &'static Mutex<Connection> {
    DB.get_or_init(|| {
        let path = db_path();
        eprintln!("[danmaku_cache] db path: {:?}", path);
        let conn = Connection::open(&path)
            .expect("Failed to open danmaku cache database");
        init_db(&conn);
        Mutex::new(conn)
    })
}

/// 计算缓存键
fn cache_key(title: &str, episode_label: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(title.as_bytes());
    hasher.update(b"||");
    hasher.update(episode_label.as_bytes());
    hex::encode(hasher.finalize())
}

/// 当前 Unix 时间戳（秒）
fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 从缓存读取弹幕（未过期则返回 Some，否则返回 None）
pub fn get_cached(title: &str, episode_label: &str) -> Option<Vec<DanmuItem>> {
    let key = cache_key(title, episode_label);
    let db = get_db().lock().ok()?;
    let mut stmt = db
        .prepare("SELECT data, created_at FROM danmaku_cache WHERE cache_key = ?1")
        .ok()?;
    let (data_json, created_at): (String, u64) = stmt.query_row([&key], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).ok()?;

    // 检查是否过期
    let elapsed = now_secs().saturating_sub(created_at);
    if elapsed > CACHE_TTL_HOURS * 3600 {
        eprintln!("[danmaku_cache] expired: key={} age={}h", &key[..12], elapsed / 3600);
        // 删除过期条目
        db.execute("DELETE FROM danmaku_cache WHERE cache_key = ?1", [&key]).ok();
        return None;
    }

    let danmu: Vec<DanmuItem> = serde_json::from_str(&data_json).ok()?;
    eprintln!("[danmaku_cache] HIT: key={} items={}", &key[..12], danmu.len());
    Some(danmu)
}

/// 将弹幕写入缓存
pub fn set_cache(title: &str, episode_label: &str, danmu: &[DanmuItem]) {
    let key = cache_key(title, episode_label);
    let data_json = serde_json::to_string(danmu).unwrap_or_default();
    let now = now_secs();
    let db = match get_db().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Err(e) = db.execute(
        "INSERT OR REPLACE INTO danmaku_cache (cache_key, data, created_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![key, data_json, now],
    ) {
        eprintln!("[danmaku_cache] write error: {}", e);
    } else {
        eprintln!("[danmaku_cache] SET: key={} items={}", &key[..12], danmu.len());
    }
}
