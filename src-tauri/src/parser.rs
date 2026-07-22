// ═══════════════════════════════════════════════════════════════════════════════
// 数据解析工具函数
// ═══════════════════════════════════════════════════════════════════════════════

use crate::models::{EpisodeItem, SourceGroup, VideoXml};

/// 解析剧集列表（扁平结构）
pub fn parse_episodes(from: &str, urls: &str) -> Vec<EpisodeItem> {
    let urls = urls.replace("$$$", "$$");
    let from = from.replace("$$$", "$$");
    if urls.is_empty() {
        return vec![];
    }
    if urls.contains("$$") {
        let fs: Vec<&str> = from.split("$$").collect();
        let us: Vec<&str> = urls.split("$$").collect();
        let mut r = Vec::new();
        for (i, u) in us.iter().enumerate() {
            r.extend(parse_eps(u, fs.get(i).copied().unwrap_or("")));
        }
        r
    } else {
        parse_eps(&urls, "")
    }
}

/// 解析按来源分组的剧集列表，仅保留可播放的 m3u8 源
pub fn parse_source_groups(from: &str, urls: &str) -> Vec<SourceGroup> {
    let urls = urls.replace("$$$", "$$");
    let from = from.replace("$$$", "$$");
    if urls.is_empty() || !urls.contains("$$") {
        // 单一来源：仅保留含 m3u8 的源
        if !urls.contains(".m3u8") {
            return vec![];
        }
        let eps = parse_episodes(&from, &urls);
        let label = if from.is_empty() {
            "默认".to_string()
        } else {
            from.clone()
        };
        return vec![SourceGroup {
            source_name: label,
            episodes: eps,
        }];
    }
    let fs: Vec<&str> = from.split("$$").collect();
    let us: Vec<&str> = urls.split("$$").collect();
    let mut m3u8_groups = Vec::new();
    for (i, u) in us.iter().enumerate() {
        let name = fs.get(i).copied().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        // 跳过不含 m3u8 URL 的源（如 share 链接的 HTML 页面）
        if !u.contains(".m3u8") {
            continue;
        }
        let eps = parse_eps(u, name);
        if !eps.is_empty() {
            m3u8_groups.push(SourceGroup {
                source_name: name.to_string(),
                episodes: eps,
            });
        }
    }
    m3u8_groups
}

fn parse_eps(s: &str, prefix: &str) -> Vec<EpisodeItem> {
    s.split('#')
        .filter_map(|part| {
            let p = part.trim();
            if p.is_empty() {
                return None;
            }
            let (l, u) = p.split_once('$').unwrap_or(("播放", p));
            Some(EpisodeItem {
                label: if prefix.is_empty() {
                    l.trim().into()
                } else {
                    format!("{}·{}", prefix, l.trim())
                },
                url: u.trim().into(),
            })
        })
        .collect()
}

/// 从 XML 格式的剧集数据中提取剧集列表
pub fn extract_xml_episodes(v: &VideoXml) -> Vec<EpisodeItem> {
    if let Some(ref dl) = v.dl {
        if let Some(ref dd) = dl.dd {
            return dd
                .clone()
                .extract()
                .into_iter()
                .filter_map(|d| d.value)
                .flat_map(|val| {
                    val.trim()
                        .split('#')
                        .filter_map(|part| {
                            let p = part.trim();
                            if p.is_empty() {
                                return None;
                            }
                            let (l, u) = p.split_once('$').unwrap_or(("播放", p));
                            Some(EpisodeItem {
                                label: l.trim().into(),
                                url: u.trim().into(),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .collect();
        }
    }
    if let Some(ref url) = v.url {
        if !url.is_empty() {
            return vec![EpisodeItem {
                label: "播放".into(),
                url: url.clone(),
            }];
        }
    }
    vec![]
}

/// 标准化标题用于去重和跨源匹配
///
/// 移除所有空白字符、全角字符转半角、常见标点符号移除，
/// 确保 "星辰变第五季" == "星辰变 第五季" == "星辰变·第五季"。
pub fn normalize_title(s: &str) -> String {
    s.trim()
        .chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| match c {
            'ａ'..='ｚ' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            'Ａ'..='Ｚ' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            '０'..='９' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            '（' => '(',
            '）' => ')',
            '《' | '》' | '·' | '•' | '、' | '，' | '。' | '：' | '＂' | '「' | '」' | '『' | '』' => ' ',
            '\u{3000}' => ' ',
            _ => c,
        })
        .collect::<String>()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

/// 修复 poster URL：相对路径补全为绝对路径
pub fn resolve_poster(poster: &str, api_base: &str) -> String {
    let p = poster.trim();
    if p.is_empty() {
        return String::new();
    }
    if p.starts_with('/') {
        let base = api_base.trim_end_matches('/');
        if let Some(pos) = base.find("://") {
            let after_scheme = &base[pos + 3..];
            if let Some(slash) = after_scheme.find('/') {
                let domain = &base[..pos + 3 + slash];
                return format!("{}{}", domain, p);
            }
            return format!("{}{}", base, p);
        }
        return p.to_string();
    }
    p.to_string()
}

/// 从剧集标签中提取数字序号
pub fn extract_episode_num(label: &str) -> Option<i32> {
    if let Ok(n) = label.trim().parse::<i32>() {
        return Some(n);
    }
    let re = regex::Regex::new(r"(\d+)").ok()?;
    re.captures(label)
        .and_then(|c| c.get(1)?.as_str().parse::<i32>().ok())
}

/// URL 编码
pub fn urlencode(s: &str) -> String {
    let mut r = String::with_capacity(s.len() * 3);
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => r.push(c),
            ' ' => r.push_str("%20"),
            _ => {
                for b in c.to_string().bytes() {
                    r.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    r
}
