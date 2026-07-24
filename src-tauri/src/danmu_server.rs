// ═══════════════════════════════════════════════════════════════════════════════
// 本地弹幕服务器管理（Sidecar）
//
// 自动管理 huangxd-/danmu_api 的 Node.js 进程生命周期：
//   1. 自动检测 node 是否可用
//   2. 自动下载 danmu_api 源码到 ~/.awesome-zhuiju/danmu-api/
//   3. 自动安装依赖（npm install）
//   4. 启动 HTTP 服务在 localhost:动态端口
//   5. 应用退出时自动清理子进程
//
// 一旦启动成功，弹幕请求走 127.0.0.1 本地服务，完全不依赖外网。
// ═══════════════════════════════════════════════════════════════════════════════

use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;
use tokio::process::Command;

/// GitHub 上 danmu_api 的 zip 下载地址
const DANMU_API_ZIP: &str = "https://github.com/huangxd-/danmu_api/archive/refs/heads/main.zip";

/// 本地 danmu_api 的工作目录名
const DANMU_API_DIR: &str = "danmu-api";

/// 服务端口
static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

/// 子进程句柄
static CHILD: OnceLock<Mutex<Option<tokio::process::Child>>> = OnceLock::new();

fn child_lock() -> &'static Mutex<Option<tokio::process::Child>> {
    CHILD.get_or_init(|| Mutex::new(None))
}

/// 获取可执行文件路径的辅助函数
fn which(exe: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
            #[cfg(windows)]
            {
                let candidate_exe = dir.join(format!("{}.exe", exe));
                if candidate_exe.is_file() {
                    return Some(candidate_exe);
                }
            }
        }
        None
    })
}

/// 获取 danmu_api 的数据目录
fn data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".awesome-zhuiju").join(DANMU_API_DIR)
}

/// 检测 Node.js 是否可用
pub fn check_node() -> Option<PathBuf> {
    which("node")
}

/// 确保 danmu_api 源码已下载并安装依赖
async fn ensure_setup() -> Result<(), String> {
    let dir = data_dir();
    let server_js = dir.join("danmu_api").join("server.js");

    if server_js.exists() {
        // 检查 node_modules
        let node_modules = dir.join("node_modules");
        if !node_modules.exists() {
            eprintln!("[danmu_server] installing dependencies...");
            let status = Command::new("npm")
                .args(["install", "--production"])
                .current_dir(&dir)
                .status()
                .await
                .map_err(|e| format!("npm install failed: {}", e))?;
            if !status.success() {
                return Err("npm install failed".into());
            }
        }
        return Ok(());
    }

    // ── 首次运行：下载 danmu_api 源码 ──
    eprintln!("[danmu_server] first run: downloading danmu_api from GitHub...");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {}", e))?;

    // 下载 zip
    let zip_data = crate::client::CLIENT
        .get(DANMU_API_ZIP)
        .send()
        .await
        .map_err(|e| format!("download failed: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("read failed: {}", e))?;

    // 解压到临时目录，然后移动
    use std::io::Cursor;
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_data))
        .map_err(|e| format!("unzip failed: {}", e))?;

    // zip 内的目录名: danmu_api-main/
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip entry: {}", e))?;
        let Some(out_path) = entry.enclosed_name().map(|p| p.to_owned()) else { continue };
        // 去掉顶层目录名（danmu_api-main/）
        let rel_path: PathBuf = out_path.components().skip(1).collect();
        if rel_path.as_os_str().is_empty() {
            continue;
        }
        let target = dir.join(&rel_path);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).ok();
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut out = std::fs::File::create(&target)
                .map_err(|e| format!("create {}: {}", target.display(), e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("extract {}: {}", target.display(), e))?;
        }
    }

    // 安装依赖
    eprintln!("[danmu_server] installing dependencies...");
    let status = Command::new("npm")
        .args(["install", "--production"])
        .current_dir(&dir)
        .status()
        .await
        .map_err(|e| format!("npm install failed: {}", e))?;
    if !status.success() {
        return Err("npm install failed".into());
    }

    eprintln!("[danmu_server] setup complete at {:?}", dir);
    Ok(())
}

/// 获取可用的端口
fn find_port() -> u16 {
    // 从 18080 开始递增，避免端口冲突
    for port in 18080..18180 {
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return port;
        }
    }
    0
}

/// 启动本地弹幕服务器
pub async fn start() {
    // 1. 检查 Node.js
    let node = match check_node() {
        Some(n) => {
            eprintln!("[danmu_server] found node at {:?}", n);
            n
        }
        None => {
            eprintln!("[danmu_server] node not found, local danmu server unavailable");
            return;
        }
    };

    // 2. 确保源码和依赖已就绪
    if let Err(e) = ensure_setup().await {
        eprintln!("[danmu_server] setup failed: {}", e);
        return;
    }

    // 3. 查找可用端口
    let port = find_port();
    if port == 0 {
        eprintln!("[danmu_server] no available port");
        return;
    }
    SERVER_PORT.store(port, Ordering::Relaxed);

    let dir = data_dir();

    // 4. 启动服务
    eprintln!("[danmu_server] starting on 127.0.0.1:{}", port);

    let child = Command::new(node)
        .args([
            dir.join("danmu_api").join("server.js").to_str().unwrap(),
        ])
        .env("PORT", port.to_string())
        .env("TOKEN", "87654321")
        .env("OTHER_SERVER", "")          // 不依赖第三方 fallback
        .env("SOURCE_ORDER", "360,vod,tencent,youku,iqiyi,imgo,bilibili,renren,hanjutv,dandan")
        .env("NODE_ENV", "production")
        .current_dir(&dir)
        .kill_on_drop(true)
        .spawn();

    match child {
        Ok(c) => {
            let mut guard = child_lock().lock().unwrap();
            *guard = Some(c);
            eprintln!("[danmu_server] running on http://127.0.0.1:{}/87654321", port);
        }
        Err(e) => {
            eprintln!("[danmu_server] failed to start: {}", e);
            SERVER_PORT.store(0, Ordering::Relaxed);
        }
    }
}

/// 获取本地弹幕服务基地址（如不可用返回 None）
pub fn get_base_url() -> Option<String> {
    let port = SERVER_PORT.load(Ordering::Relaxed);
    if port > 0 {
        Some(format!("http://127.0.0.1:{}/87654321", port))
    } else {
        None
    }
}

/// 关闭本地弹幕服务器
pub async fn shutdown() {
    if let Ok(mut guard) = child_lock().lock() {
        if let Some(mut child) = guard.take() {
            eprintln!("[danmu_server] shutting down...");
            child.kill().await.ok();
            child.wait().await.ok();
            eprintln!("[danmu_server] stopped");
        }
    }
}
