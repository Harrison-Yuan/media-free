export interface SourceInfo {
  name: string;
  api_url: string;
}

export interface VideoItem {
  id: string;
  title: string;
  poster: string;
  remark: string;
  description: string;
  source: SourceInfo;
  episodes: EpisodeItem[];
  source_groups: SourceGroup[];
}

export interface SearchResult {
  items: VideoItem[];
  elapsed_ms: number;
  local: boolean;
  sources_total: number;
  sources_responding: number;
}

export interface EpisodeItem {
  label: string;
  url: string;
}

/** 同一视频不同来源的剧集分组 */
export interface SourceGroup {
  source_name: string;
  episodes: EpisodeItem[];
}

export interface VideoDetail {
  id: string;
  title: string;
  poster: string;
  description: string;
  source_name: string;
  episodes: EpisodeItem[];
  /** 按来源分组的剧集（前端用于源切换） */
  source_groups: SourceGroup[];
}

/** 从 API class 字段解析的分类 */
export interface Category {
  type_id: number;
  type_name: string;
  source_name: string;
}

// 核心分类后备（API 获取失败时使用，仅核心 1-4 通用）
// 扩展分类（如"短剧"的 type_id 因源而异）由后端动态发现
export const CORE_CATEGORIES: Category[] = [
  { type_id: 1, type_name: "电影", source_name: "" },
  { type_id: 2, type_name: "电视剧", source_name: "" },
  { type_id: 3, type_name: "综艺", source_name: "" },
  { type_id: 4, type_name: "动漫", source_name: "" },
];

// ─── 事件推送数据类型 ───────────────────────────────────────────────────────
// 后端 search-update 事件的 payload

export interface SearchUpdateEvent {
  items: VideoItem[];
  sources_responding: number;
  elapsed_ms: number;
}

// ─── 来源名称映射 ──────────────────────────────────────────────────────────
// 后端 source_groups 中 source_name 来自 Apple CMS 的 vod_play_from 字段，
// 这些是各资源站内部使用的播放源标签（如 "liangzi", "lzm3u8"），
// 此映射将原始标签统一为前端显示的中文名。
// key: 原始名称（小写，子串匹配），value: 显示名称
export const SOURCE_NAME_MAP: Record<string, string> = {
  // ── 量子资源 ──
  liangzi: "量子源",
  lzm3u8: "量子M3U8",
  // ── 非凡资源 ──
  feifan: "非凡源",
  ffm3u8: "非凡M3U8",
  // ── 红牛资源 ──
  hnyun: "红牛云",
  hnm3u8: "红牛M3U8",
  // ── 火狐采集 ──
  hhyun: "火狐云",
  hhm3u8: "火狐M3U8",
  // ── 虎牙采集 ──
  hym3u8: "虎牙M3U8",
  // ── 小胡资源 ──
  hum3u8: "小胡M3U8",
  // ── 百度采集 ──
  dbm3u8: "百度M3U8",
  // ── 短剧资源 ──
  duanju: "短剧源",
  // ── 通用视频平台 ──
  youku: "优酷",
  qiyi: "爱奇艺",
  qq: "腾讯视频",
  mgtv: "芒果TV",
  sohu: "搜狐视频",
  pptv: "PPTV",
  letv: "乐视TV",
  bilibili: "哔哩哔哩",
  sinahd: "新浪",
  "27pan": "27盘",
  douban: "豆瓣",
  migu: "咪咕",
  yangshipin: "央视频",
  huya: "虎牙直播",
  douyin: "抖音",
};
