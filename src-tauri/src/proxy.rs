// ═══════════════════════════════════════════════════════════════════════════════
// 本地视频代理：为非 m3u8 URL 添加 Referer/Origin 头
// ═══════════════════════════════════════════════════════════════════════════════
//
// 问题：<video> 元素发起的 HTTP 请求无法自定义 Referer 头，
//       部分 CDN 因此拒绝非 m3u8 视频请求。
// 方案：本地启动 HTTP 代理，前端视频 URL 指向此代理，
//       代理用 reqwest（可设自定义头）获取视频并流式转发。

use std::sync::OnceLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

/// 代理端口（应用启动时初始化）
static PROXY_PORT: OnceLock<u16> = OnceLock::new();

/// 获取代理端口
pub fn get_proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied()
}

/// 将视频 URL 转为本地代理 URL（仅对非 m3u8 URL 有效）
pub fn to_proxy_url(video_url: &str, referer: &str) -> String {
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

    // 用 reqwest 获取视频（带自定义头，长超时）
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .http1_only()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| eprintln!("[proxy] client build: {}", e))
        .ok()
        .unwrap_or_else(|| reqwest::Client::new());

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

    // 构建响应头
    let status_line = format!("HTTP/1.1 {} {}\r\n", resp.status().as_u16(),
        resp.status().canonical_reason().unwrap_or("Unknown"));
    let mut header = status_line.into_bytes();

    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");
    header.extend_from_slice(b"Content-Type: ");
    header.extend_from_slice(content_type.as_bytes());
    header.extend_from_slice(b"\r\n");

    // Content-Length 如果有就透传
    if let Some(cl) = resp.headers().get("content-length") {
        header.extend_from_slice(b"Content-Length: ");
        header.extend_from_slice(cl.as_bytes());
        header.extend_from_slice(b"\r\n");
    }

    // CORS 头（允许任意来源）
    header.extend_from_slice(b"Access-Control-Allow-Origin: *\r\n");
    header.extend_from_slice(b"Accept-Ranges: bytes\r\n");
    header.extend_from_slice(b"Connection: close\r\n\r\n");

    // 发送响应头
    if writer.write_all(&header).await.is_err() {
        return;
    }

    // 流式转发响应体
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
