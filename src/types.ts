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
  hits: number;
  score: number;
  year: string;
  area: string;
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
  /** 父分类 type_id（0 = 一级分类，>0 = 二级分类所属的父分类 ID） */
  type_pid: number;
}

// 核心分类后备（API 获取失败时使用，仅核心 1-4 通用）
// 扩展分类（如"短剧"的 type_id 因源而异）由后端动态发现
export const CORE_CATEGORIES: Category[] = [
  { type_id: 1, type_name: "电影", source_name: "", type_pid: 0 },
  { type_id: 2, type_name: "电视剧", source_name: "", type_pid: 0 },
  { type_id: 3, type_name: "综艺", source_name: "", type_pid: 0 },
  { type_id: 4, type_name: "动漫", source_name: "", type_pid: 0 },
];

// ─── 二级分类本地映射表 ─────────────────────────────────────────────────────
//
// 数据来源：Apple CMS 官方文档 https://www.kancloud.cn/pgcms/maccms/2405302
// type_pid 字段指向一级分类的 type_id：
//   电影(1) → 喜剧片(6), 爱情片(7), 科幻片(8), 恐怖片(9), 剧情片(10), 战争片(11)
//   电视剧(2) → 国产剧(12), 港台剧(13), 日韩剧(14), 欧美剧(15)
//
// 用途：前端筛选组件使用此表显示二级分类按钮。
// 优先使用后端 fetch_subcategories 返回的实时数据，
// 此表作为后端不可用时的前端本地兜底。
// 注意：此映射仅适用于标准 Apple CMS 源，
//       per-source 特殊分类（如短剧）由后端单独处理。
export interface SubCategory {
  type_id: number;
  type_name: string;
}

export const SUB_CATEGORY_MAP: Record<number, SubCategory[]> = {
  1: [ // 电影 → 二级分类
    { type_id: 6, type_name: "喜剧片" },
    { type_id: 7, type_name: "爱情片" },
    { type_id: 8, type_name: "科幻片" },
    { type_id: 9, type_name: "恐怖片" },
    { type_id: 10, type_name: "剧情片" },
    { type_id: 11, type_name: "战争片" },
  ],
  2: [ // 电视剧 → 二级分类
    { type_id: 12, type_name: "国产剧" },
    { type_id: 13, type_name: "港台剧" },
    { type_id: 14, type_name: "日韩剧" },
    { type_id: 15, type_name: "欧美剧" },
  ],
};

/** 从本地映射表获取指定一级分类的二级分类列表 */
export function getLocalSubCategories(parentTypeId: number): SubCategory[] {
  return SUB_CATEGORY_MAP[parentTypeId] ?? [];
}

// ─── 地区本地映射表 ─────────────────────────────────────────────────────────
//
// 数据来源：Apple CMS 官方文档 https://www.maccms.plus/theme/theme-vod.html
// API 支持 area 参数筛选地区（如大陆、香港、美国等）
// 此表用于前端筛选组件显示地区选项。
// 注意：并非所有源都支持 area 筛选，不支持的源会忽略此参数。

export const AREA_OPTIONS = [
  "大陆",
  "香港",
  "台湾",
  "美国",
  "日本",
  "韩国",
  "英国",
  "法国",
  "泰国",
  "印度",
  "其他",
] as const;

export type AreaValue = (typeof AREA_OPTIONS)[number];

// ─── 年份本地映射表 ─────────────────────────────────────────────────────────
//
// 数据来源：Apple CMS 官方文档 https://www.maccms.plus/theme/theme-vod.html
// API 支持 year 参数筛选年份。
// 动态生成近 15 年 + 更早选项。

export function getYearOptions(): number[] {
  const current = new Date().getFullYear(); // 2026
  const years: number[] = [];
  for (let y = current; y >= current - 15; y--) {
    years.push(y);
  }
  return years;
}

export const YEAR_OPTIONS = getYearOptions();

/** 筛选状态类型：记录所有激活的筛选条件 */
export interface FilterState {
  typeId: number | null;   // 二级分类 type_id，null=全部
  area: string | null;     // 地区，null=全部
  year: number | null;     // 年份，null=全部
}

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
