use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

/// 自定义反序列化：vod_id 可能是数字(84134)或字符串("24877")
fn de_id<'de, D>(d: D) -> Result<Option<String>, D::Error>
where D: Deserializer<'de> {
    Ok(match Value::deserialize(d) {
        Ok(Value::String(s)) => Some(s),
        Ok(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    })
}

/// 自定义反序列化：vod_score 可能是字符串("5.7")或数字(5.7)
/// 各平台 API 返回格式不一致，统一兼容
fn de_score<'de, D>(d: D) -> Result<Option<f64>, D::Error>
where D: Deserializer<'de> {
    Ok(match Value::deserialize(d) {
        Ok(Value::String(s)) => s.parse::<f64>().ok(),
        Ok(Value::Number(n)) => n.as_f64(),
        _ => None,
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 前端 API 契约
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Clone)]
pub struct SourceInfo {
    pub name: String,
    pub api_url: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoItem {
    pub id: String,
    pub title: String,
    pub poster: String,
    pub remark: String,
    pub description: String,
    pub source: SourceInfo,
    pub episodes: Vec<EpisodeItem>,
    pub source_groups: Vec<SourceGroup>,
    pub hits: i64,
    pub score: f64,
    pub year: String,
    pub area: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub items: Vec<VideoItem>,
    pub elapsed_ms: u64,
    pub local: bool,
    pub sources_total: u32,
    pub sources_responding: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct EpisodeItem {
    pub label: String,
    pub url: String,
}

/// 同一视频不同来源的剧集分组
#[derive(Debug, Serialize, Clone)]
pub struct SourceGroup {
    pub source_name: String,
    pub episodes: Vec<EpisodeItem>,
}

#[derive(Debug, Serialize)]
pub struct VideoDetail {
    pub id: String,
    pub title: String,
    pub poster: String,
    pub description: String,
    pub source_name: String,
    pub episodes: Vec<EpisodeItem>,
    /// 按来源分组的剧集列表（用于前端源切换）
    pub source_groups: Vec<SourceGroup>,
}

/// 弹弹play 弹幕数据结构
#[derive(Debug, Serialize, Clone)]
pub struct DanmuItem {
    pub text: String,
    pub mode: i32,
    pub color: String,
    pub time: f64,
}

/// TVBox 配置中提取的 type=1 视频源定义
#[derive(Debug, Clone)]
pub struct SourceDef {
    pub name: String,
    pub url: String,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Apple CMS / XML RSS 解析
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Deserialize)]
pub struct AppleCmsResponse {
    pub list: Option<Vec<AppleCmsItem>>,
    pub class: Option<Vec<ClassItem>>,
}

/// Apple CMS 返回的分类项
#[derive(Debug, Deserialize, Clone)]
pub struct ClassItem {
    pub type_id: i32,
    pub type_name: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppleCmsItem {
    #[serde(default, deserialize_with = "de_id")]
    pub vod_id: Option<String>,
    pub vod_name: Option<String>,
    pub vod_pic: Option<String>,
    pub vod_remarks: Option<String>,
    pub vod_content: Option<String>,
    pub vod_play_from: Option<String>,
    pub vod_play_url: Option<String>,
    pub vod_hits: Option<i64>,
    #[serde(default, deserialize_with = "de_score")]
    pub vod_score: Option<f64>,
    pub vod_time: Option<String>,
    pub vod_year: Option<String>,
    pub vod_area: Option<String>,
    pub vod_lang: Option<String>,
    pub vod_actor: Option<String>,
    pub vod_director: Option<String>,
}

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
    Single(VideoXml), Multiple(Vec<VideoXml>), Null,
}
impl VecItem {
    pub fn into_vec(self) -> Vec<VideoXml> {
        match self { VecItem::Single(v) => vec![v], VecItem::Multiple(v) => v, VecItem::Null => vec![] }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct VideoXml {
    pub id: Option<String>, pub name: Option<String>, pub pic: Option<String>,
    pub note: Option<String>, pub des: Option<String>,
    pub dl: Option<Dl>, pub url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Dl { pub dd: Option<DdItem> }

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum DdItem { Single(Dd), Multiple(Vec<Dd>) }
impl DdItem {
    pub fn extract(self) -> Vec<Dd> {
        match self { DdItem::Single(d) => vec![d], DdItem::Multiple(v) => v }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct Dd {
    #[serde(rename = "$value")]
    pub value: Option<String>,
}
