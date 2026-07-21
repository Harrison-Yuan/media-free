use serde::{Deserialize, Serialize};

// ====== 搜索 & 播放相关 ======

#[derive(Debug, Serialize, Clone)]
pub struct SearchItem {
    pub id: String,
    pub name: String,
    pub pic: String,
    pub note: String,
    pub source_url: String,
    pub source_name: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub total: usize,
    pub sources: usize,
    pub items: Vec<SearchItem>,
}

#[derive(Debug, Serialize)]
pub struct VideoDetail {
    pub id: String,
    pub name: String,
    pub pic: String,
    pub desc: String,
    pub source_name: String,
    pub play_urls: Vec<PlayUrl>,
}

#[derive(Debug, Serialize)]
pub struct PlayUrl {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub sources: usize,
    pub working: usize,
    pub details: Vec<String>,
}

// ====== Apple CMS / 海洋CMS API 响应 ======

#[derive(Debug, Deserialize)]
pub struct AppleCmsResponse {
    pub list: Option<Vec<AppleCmsItem>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppleCmsItem {
    pub vod_id: Option<String>,
    pub vod_name: Option<String>,
    pub vod_pic: Option<String>,
    pub vod_remarks: Option<String>,
    pub vod_content: Option<String>,
    pub vod_play_from: Option<String>,
    pub vod_play_url: Option<String>,
    pub type_name: Option<String>,
    pub vod_year: Option<String>,
    pub vod_actor: Option<String>,
    pub vod_director: Option<String>,
}

// ====== XML RSS 响应（备用格式） ======

#[derive(Debug, Deserialize)]
pub struct RssResponse {
    pub rss: Option<Rss>,
}

#[derive(Debug, Deserialize)]
pub struct Rss {
    pub list: Option<RssList>,
}

#[derive(Debug, Deserialize)]
pub struct RssList {
    pub video: Option<VecItem>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum VecItem {
    Single(VideoXml),
    Multiple(Vec<VideoXml>),
    Null,
}

impl VecItem {
    pub fn into_vec(self) -> Vec<VideoXml> {
        match self {
            VecItem::Single(v) => vec![v],
            VecItem::Multiple(v) => v,
            VecItem::Null => vec![],
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct VideoXml {
    pub id: Option<String>,
    pub name: Option<String>,
    pub pic: Option<String>,
    pub note: Option<String>,
    pub des: Option<String>,
    pub dl: Option<Dl>,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Dl {
    pub dd: Option<DdItem>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum DdItem {
    Single(Dd),
    Multiple(Vec<Dd>),
}

impl DdItem {
    pub fn extract(self) -> Vec<Dd> {
        match self {
            DdItem::Single(d) => vec![d],
            DdItem::Multiple(v) => v,
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct Dd {
    #[serde(rename = "$value")]
    pub value: Option<String>,
}

// ====== 视频源配置 ======

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoSource {
    pub name: String,
    pub url: String,
    pub api: String,
    pub searchable: bool,
}

// ====== IPTV 相关 ======

#[derive(Debug, Serialize)]
pub struct IptvChannel {
    pub name: String,
    pub logo: String,
    pub url: String,
    pub category: String,
}
