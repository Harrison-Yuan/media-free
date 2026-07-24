import { useEffect, useState } from "react";
import { getVideoDetail } from "../lib/api";
import { DetailView } from "./DetailView";
import { VideoPlayer } from "./VideoPlayer";
import { ToastContainer } from "./Toast";
import type { VideoDetail } from "../types";

/**
 * 详情窗口根组件
 *
 * 由 Tauri 新窗口加载，从 URL 参数中读取视频信息，
 * 调用后端 API 获取详情后渲染播放器 + 剧集列表。
 *
 * 状态流程：
 *   loading → 加载成功 → DetailView
 *          → 加载失败 → 错误降级 UI + 重试按钮
 */
export function DetailWindow() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") ?? "";
  const source = params.get("source") ?? "";
  const api = params.get("api") ?? "";

  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const loadDetail = () => {
    if (!id || !source || !api) {
      setError("缺少视频信息参数");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getVideoDetail(source, api, id)
      .then(setDetail)
      .catch((e) => setError(e.message || "详情加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--primary)",
            }}
          />
          <span
            className="text-[13px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            加载详情中...
          </span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !detail) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-5"
        style={{ background: "var(--background)" }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--secondary)" }}
        >
          <svg
            className="h-6 w-6"
            style={{ color: "var(--text-tertiary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.75L13.75 4a2 2 0 00-3.5 0L3.25 16.25A2 2 0 005.07 19z"
            />
          </svg>
        </div>
        <p
          className="text-[16px] font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          详情加载失败
        </p>
        <p
          className="text-[13px] -mt-3 text-center max-w-[300px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {error || "无法获取视频详情，请检查网络连接"}
        </p>
        <button
          onClick={loadDetail}
          className="rounded-full px-5 py-2 text-[13px] font-medium transition-all duration-200 active:scale-[0.95]"
          style={{
            background: "var(--primary)",
            color: "#fff",
          }}
        >
          重新加载
        </button>
        <ToastContainer />
      </div>
    );
  }

  // ── Success ──
  return (
    <>
      <DetailView
        detail={detail}
        playing={playing}
        onPlay={(url) => setPlaying(url)}
      />
      {playing && (
        <VideoPlayer
          url={playing}
          title={detail.title}
          episodeLabel=""
        />
      )}
      <ToastContainer />
    </>
  );
}
