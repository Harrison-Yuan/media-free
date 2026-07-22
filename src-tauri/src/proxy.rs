// ═══════════════════════════════════════════════════════════════════════════════
// 本地视频代理：为所有视频请求绕过系统代理，直连 CDN
// ═══════════════════════════════════════════════════════════════════════════════
//
// 问题：hls.js（浏览器 XHR）发起的请求会跟随系统代理（VPN/Clash 等），
//       导致视频 CDN 请求从境外 IP 发出而被拦截。
// 方案：本地启动 HTTP 代理，前端所有视频请求指向此代理，
//       代理用 reqwest（配置 no_proxy）获取视频并流式转发。
//
// 关键能力：
//   - /proxy?url=U&ref=R  标准代理（支持 Referer）
//   - 自动重写 m3u8 清单中的相对路径为绝对 CDN URL，确保 hls.js 能正确解析

use std::sync::OnceLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use url::Url;

/// 代理端口（应用启动时初始化）
static PROXY_PORT: OnceLock<u16> = OnceLock::new();

/// 获取代理端口
pub fn get_proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied()
}

/// 构建代理 URL（用于前端传递视频 URL 给代理）
pub fn make_proxy_url(video_url: &str, referer: &str) -> String {
    let port = PROXY_PORT.get().copied().unwrap_or(0);
    if port == 0 {
        return video_url.to_string();
    }
    let encoded_url = urlencoding(video_url);
    let encoded_ref = urlencoding(referer);
    format!("http://127.0.0.1:{}/proxy?url={}&ref={}", port, encoded_url, encoded_ref)
}

fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// 启动本地视频代理（在随机端口监听）
pub async fn start() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("proxy bind: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("proxy addr: {}", e))?
        .port();
    PROXY_PORT.set(port).ok();

    eprintln!("[proxy] started on http://127.0.0.1:{}/proxy", port);

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tokio::spawn(handle_connection(stream));
                }
                Err(e) => {
                    eprintln!("[proxy] accept error: {}", e);
                }
            }
        }
    });

    Ok(port)
}

async fn handle_connection(stream: tokio::net::TcpStream) {
    let (reader, mut writer) = stream.into_split();
    let mut buf_reader = BufReader::new(reader);
    let mut request_line = String::new();

    // 读取请求行
    if buf_reader.read_line(&mut request_line).await.is_err() {
        return;
    }
    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 || parts[0] != "GET" {
        let _ = writer.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n").await;
        return;
    }

    let path = parts[1];
    if !path.starts_with("/proxy") {
        let _ = writer.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
        return;
    }

    // 解析查询参数
    let query = path.trim_start_matches("/proxy");
    let (target_url, referer) = parse_query(query);
    let target_url = match target_url {
        Some(u) => percent_decode(&u),
        None => {
            let _ = writer.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n").await;
            return;
        }
    };
    let referer = referer.map(|r| percent_decode(&r)).unwrap_or_default();

    // 跳过剩余请求头
    let mut header_line = String::new();
    loop {
        header_line.clear();
        if buf_reader.read_line(&mut header_line).await.is_err() {
            return;
        }
        if header_line.trim().is_empty() {
            break;
        }
    }

    // ── 用 reqwest（no_proxy 绕过系统代理）获取视频 ──
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(300))
        .http1_only()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| eprintln!("[proxy] client build: {}", e))
        .ok()
        .unwrap_or_else(|| reqwest::Client::builder().no_proxy().build().unwrap());

    let resp = match client
        .get(&target_url)
        .header("Referer", if referer.is_empty() { &target_url } else { &referer })
        .header("Origin", if referer.is_empty() { target_url.trim_end_matches('/') } else { referer.trim_end_matches('/') })
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            let _ = writer.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n").await;
            return;
        }
    };

    // 判断是否为 m3u8 内容（需重写相对路径为绝对路径）
    let is_m3u8 = target_url.contains(".m3u8")
        || resp.headers().get("content-type")
            .and_then(|v| v.to_str().ok())
            .map_or(false, |ct| ct.contains("m3u8") || ct.contains("vnd.apple.mpegurl"));

    // 构建响应头
    let status_line = format!("HTTP/1.1 {} {}\r\n", resp.status().as_u16(),
        resp.status().canonical_reason().unwrap_or("Unknown"));
    let mut header = status_line.into_bytes();

    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");

    if is_m3u8 {
        // m3u8 内容由我们重写后返回，Content-Type 固定
        header.extend_from_slice(b"Content-Type: application/vnd.apple.mpegurl\r\n");
    } else {
        header.extend_from_slice(b"Content-Type: ");
        header.extend_from_slice(content_type.as_bytes());
        header.extend_from_slice(b"\r\n");
    }

    // CORS 头
    header.extend_from_slice(b"Access-Control-Allow-Origin: *\r\n");
    header.extend_from_slice(b"Accept-Ranges: bytes\r\n");
    header.extend_from_slice(b"Connection: close\r\n\r\n");

    // 发送响应头
    if writer.write_all(&header).await.is_err() {
        return;
    }

    // ── 如果是 m3u8 内容，重写相对路径为绝对路径 ──
    if is_m3u8 {
        if let Ok(bytes) = resp.bytes().await {
            let rewritten = rewrite_m3u8_urls(&bytes, &target_url);
            let _ = writer.write_all(rewritten.as_bytes()).await;
        }
        return;
    }

    // ── 非 m3u8：直接流式转发 ──
    use futures::StreamExt;
    let mut stream = resp.bytes_stream();
    loop {
        let chunk = stream.next().await;
        match chunk {
            Some(Ok(bytes)) => {
                if writer.write_all(&bytes).await.is_err() {
                    break;
                }
            }
            _ => break,
        }
    }
}

/// 重写 m3u8 内容：将相对路径的 URI 替换为绝对 CDN URL
///
/// hls.js 的内部 URL 解析基于清单 URL（即我们的代理 URL），
/// 相对路径会被解析到 `http://127.0.0.1:PORT/` 目录下而失效。
/// 通过将所有相对路径转为绝对 CDN URL，hls.js 可以正确构建后续请求，
/// 再经由自定义 Loader 路由到代理。
fn rewrite_m3u8_urls(content: &[u8], cdn_url: &str) -> String {
    let text = String::from_utf8_lossy(content);
    let base = match Url::parse(cdn_url) {
        Ok(u) => u,
        Err(_) => return text.to_string(),
    };

    let mut out = String::with_capacity(text.len() + 512);
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            // 非 URI 行：直接保留
            out.push_str(line);
            out.push('\n');
            continue;
        }
        // URI 行：可能是相对路径，解析为绝对 CDN URL
        match base.join(trimmed) {
            Ok(abs) => out.push_str(abs.as_str()),
            Err(_) => out.push_str(trimmed),
        }
        out.push('\n');
    }
    out
}

fn parse_query(query: &str) -> (Option<String>, Option<String>) {
    let query = query.trim_start_matches('?');
    let mut url = None;
    let mut ref_ = None;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next().unwrap_or("");
        let val = parts.next().unwrap_or("");
        match key {
            "url" => url = Some(val.to_string()),
            "ref" => ref_ = Some(val.to_string()),
            _ => {}
        }
    }
    (url, ref_)
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hi = chars.next().and_then(|c| c.to_digit(16)).unwrap_or(0);
            let lo = chars.next().and_then(|c| c.to_digit(16)).unwrap_or(0);
            bytes.push((hi * 16 + lo) as u8);
        } else {
            bytes.push(c as u8);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}
