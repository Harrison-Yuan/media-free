import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SOURCE_NAME_MAP, type VideoItem } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 标题标准化：去空格、转小写、去标点，用于去重比较 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, "")
    .replace(/[·•、，。：""《》「」『』（）()]/g, "")
    .toLowerCase();
}

/** 合并增量搜索结果（去重：按 normalized title，保留先到者） */
export function mergeSearchResults(
  existing: VideoItem[],
  incoming: VideoItem[],
): VideoItem[] {
  const seen = new Set(existing.map((i) => normalizeTitle(i.title)));
  const fresh = incoming.filter((i) => !seen.has(normalizeTitle(i.title)));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh];
}

/** 获取来源的中文显示名 */
export function getSourceDisplayName(rawName: string): string {
  // 精确匹配
  if (SOURCE_NAME_MAP[rawName]) return SOURCE_NAME_MAP[rawName];

  const lower = rawName.toLowerCase();
  // 按 key 长度降序排列，避免短 key（如 "qq"）误匹配长名称
  const entries = Object.entries(SOURCE_NAME_MAP).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [key, display] of entries) {
    if (lower.includes(key)) return display;
  }

  // 兜底：原样返回
  return rawName;
}

/** 清洗剧集标签：去掉源名前缀（如 "量子源·第01集" → "第01集"） */
export function cleanEpisodeLabel(label: string): string {
  const idx = label.indexOf("·");
  return idx !== -1 ? label.slice(idx + 1) : label;
}

// 12 组 Apple 风格渐变配色，覆盖色相环
const GRADIENTS = [
  ["#007aff", "#5856d6"], // 蓝→紫
  ["#ff2d55", "#ff9500"], // 红→橙
  ["#34c759", "#5ac8fa"], // 绿→青
  ["#ff9500", "#ffcc00"], // 橙→黄
  ["#5856d6", "#ff2d55"], // 紫→粉
  ["#5ac8fa", "#007aff"], // 青→蓝
  ["#ffcc00", "#ff9500"], // 黄→橙
  ["#ff2d55", "#5856d6"], // 粉→紫
  ["#34c759", "#007aff"], // 绿→蓝
  ["#ff9500", "#ff2d55"], // 橙→红
  ["#5ac8fa", "#34c759"], // 青→绿
  ["#5856d6", "#5ac8fa"], // 紫→青
];

/** 根据标题生成一致的渐变背景样式（无封面时的后备） */
export function posterFallbackStyle(title: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % GRADIENTS.length;
  const [from, to] = GRADIENTS[idx];
  return {
    background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  };
}
