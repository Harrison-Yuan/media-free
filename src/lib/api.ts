import { invoke } from "@tauri-apps/api/core";
import type { SearchResult, VideoDetail, Category, SourceGroup } from "../types";

export class ApiError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ApiError";
  }
}

function parseError(err: unknown): ApiError {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err);
  const i = msg.indexOf(":");
  if (i > 0)
    return new ApiError(msg.slice(i + 1).trim(), msg.slice(0, i).trim());
  return new ApiError(msg, "UNKNOWN");
}

export async function searchVideo(
  keyword: string,
  typeId?: number,
  page?: number,
  area?: string,
  year?: number,
): Promise<SearchResult> {
  try {
    return await invoke<SearchResult>("search_video", {
      keyword,
      typeId: typeId ?? null,
      page: page ?? null,
      area: area ?? null,
      year: year ?? null,
    });
  } catch (e) {
    throw parseError(e);
  }
}

export async function getVideoDetail(
  sourceName: string,
  apiUrl: string,
  videoId: string,
): Promise<VideoDetail> {
  try {
    return await invoke<VideoDetail>("get_video_detail", {
      sourceName,
      apiUrl,
      videoId,
    });
  } catch (e) {
    throw parseError(e);
  }
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    return await invoke<Category[]>("fetch_categories");
  } catch {
    return [];
  }
}

/** 获取指定一级分类的二级分类列表 */
export async function fetchSubcategories(
  parentTypeId: number,
): Promise<Array<{ type_id: number; type_name: string }>> {
  try {
    return await invoke<Array<{ type_id: number; type_name: string }>>(
      "fetch_subcategories",
      { parentTypeId },
    );
  } catch {
    return [];
  }
}

export async function fetchSourceDetail(
  keyword: string,
  sourceName: string,
  apiUrl: string,
): Promise<SourceGroup[]> {
  try {
    return await invoke<SourceGroup[]>("fetch_source_detail", {
      keyword,
      sourceName,
      apiUrl,
    });
  } catch {
    return [];
  }
}

/** 获取本地视频代理端口 */
export async function getProxyPort(): Promise<number> {
  try {
    return await invoke<number>("get_proxy_port");
  } catch {
    return 0;
  }
}

export interface ProxyModeInfo {
  has_tun: boolean;
  has_http_proxy: boolean;
}

/** 检测系统代理模式 */
export async function checkProxyMode(): Promise<ProxyModeInfo> {
  try {
    return await invoke<ProxyModeInfo>("check_proxy_mode");
  } catch {
    return { has_tun: false, has_http_proxy: false };
  }
}
