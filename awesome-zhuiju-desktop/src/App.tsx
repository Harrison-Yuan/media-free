import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Hls from "hls.js";
import "./App.css";

interface PlayUrl {
  name: string;
  url: string;
}
interface SearchItem {
  id: string;
  name: string;
  pic: string;
  note: string;
  source_url: string;
  source_name: string;
}
interface SearchResponse {
  total: number;
  sources: number;
  items: SearchItem[];
}
interface VideoDetail {
  id: string;
  name: string;
  pic: string;
  desc: string;
  source_name: string;
  play_urls: PlayUrl[];
}

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (url.endsWith(".m3u8") || url.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        return () => hls.destroy();
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.play().catch(() => {});
        return () => {
          video.pause();
          video.src = "";
        };
      }
    }
    video.src = url;
    video.play().catch(() => {});
    return () => {
      video.pause();
      video.src = "";
    };
  }, [url]);
  return (
    <div
      className="relative w-full bg-black rounded-xl overflow-hidden"
      style={{ maxHeight: "55vh" }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        autoPlay
        style={{ maxHeight: "55vh" }}
      />
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-xs transition-opacity hover:opacity-100 opacity-60"
        style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
      >
        ✕
      </button>
    </div>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourceInfo, setSourceInfo] = useState("");
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [currentPlayUrl, setCurrentPlayUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setDetail(null);
    setCurrentPlayUrl(null);
    try {
      const resp = await invoke<SearchResponse>("search_video", { keyword: q });
      setResults(resp.items);
      setSourceInfo(
        resp.sources > 0
          ? `${resp.sources} 个源返回 ${resp.total} 条结果`
          : "暂无可用源",
      );
    } catch {
      setResults([]);
      setSourceInfo("搜索失败");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const openDetail = useCallback(async (item: SearchItem) => {
    setLoadingDetail(true);
    setDetail(null);
    setCurrentPlayUrl(null);
    try {
      const d = await invoke<VideoDetail>("get_video_detail", {
        sourceUrl: item.source_url,
        sourceName: item.source_name,
        videoId: item.id,
      });
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: "var(--bg-primary)" }}
    >
      <header
        className="flex-shrink-0 border-b px-4 py-3 flex items-center gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--accent)" }}
          >
            Z
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            追剧
          </span>
        </div>
        <div className="flex-1 max-w-xl relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="搜电影 / 电视剧..."
            className="w-full rounded-xl border px-3 py-2 pl-9 text-sm outline-none transition-all"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--text-tertiary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {query.trim() && (
            <button
              onClick={doSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              搜索
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left: Search Results */}
        <div
          className={`flex-1 overflow-y-auto ${detail ? "hidden md:block" : ""}`}
        >
          <div className="p-4">
            {searched && !loading && sourceInfo && (
              <p
                className="text-xs mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                {sourceInfo}
              </p>
            )}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton rounded-xl"
                    style={{ aspectRatio: "3/4" }}
                  />
                ))}
              </div>
            )}
            {!loading && results.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {results.map((item, i) => (
                  <button
                    key={`${item.id}-${i}`}
                    onClick={() => openDetail(item)}
                    className="group rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98] border"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "3/4",
                        background: "var(--bg-secondary)",
                      }}
                    >
                      {item.pic ? (
                        <img
                          src={item.pic}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : null}
                      {!item.pic && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-8 h-8"
                            style={{ color: "var(--text-tertiary)" }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </p>
                      {item.note && (
                        <p
                          className="text-xs mt-0.5 truncate"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {item.note}
                        </p>
                      )}
                      <p
                        className="text-[10px] mt-1 opacity-60 truncate"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {item.source_name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searched && !loading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <svg
                  className="w-12 h-12 mb-3"
                  style={{ color: "var(--text-tertiary)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p style={{ color: "var(--text-tertiary)" }}>
                  没有找到相关影视
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  换个关键词试试
                </p>
              </div>
            )}
            {!searched && (
              <div className="flex flex-col items-center justify-center py-20">
                <svg
                  className="w-14 h-14 mb-4"
                  style={{ color: "var(--text-tertiary)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p style={{ color: "var(--text-tertiary)" }}>
                  输入片名，搜索多个视频源
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  支持直接在线播放
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        {(detail || loadingDetail) && (
          <div
            className="w-full md:w-[420px] lg:w-[480px] border-l overflow-y-auto flex-shrink-0"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-secondary)",
            }}
          >
            {loadingDetail ? (
              <div className="p-5 space-y-4">
                <div
                  className="skeleton rounded-xl"
                  style={{ aspectRatio: "16/9" }}
                />
                <div className="skeleton h-6 w-3/4 rounded-lg" />
                <div className="skeleton h-4 w-1/2 rounded-lg" />
                <div className="skeleton h-20 rounded-lg" />
              </div>
            ) : detail ? (
              <div className="p-5">
                <button
                  onClick={() => setDetail(null)}
                  className="md:hidden mb-3 flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>{" "}
                  返回
                </button>

                {/* Poster */}
                <div
                  className="rounded-xl overflow-hidden mb-4"
                  style={{ background: "var(--bg-card)" }}
                >
                  {detail.pic ? (
                    <img
                      src={detail.pic}
                      alt={detail.name}
                      className="w-full object-cover"
                      style={{ maxHeight: "260px" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className="w-full flex items-center justify-center"
                      style={{ height: "180px", background: "var(--bg-card)" }}
                    >
                      <svg
                        className="w-10 h-10"
                        style={{ color: "var(--text-tertiary)" }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Title & Source */}
                <h2
                  className="text-lg font-semibold mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {detail.name}
                </h2>
                <p
                  className="text-xs mb-3"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  来源: {detail.source_name}
                </p>

                {/* Description */}
                {detail.desc && (
                  <p
                    className="text-sm mb-4 leading-relaxed line-clamp-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {detail.desc}
                  </p>
                )}

                {/* Player or Play Buttons */}
                {currentPlayUrl ? (
                  <div>
                    <VideoPlayer
                      url={currentPlayUrl}
                      onClose={() => setCurrentPlayUrl(null)}
                    />
                    <div className="flex gap-2 mt-3">
                      {detail.play_urls
                        .filter((p) => p.url !== currentPlayUrl)
                        .slice(0, 5)
                        .map((p, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPlayUrl(p.url)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors flex-shrink-0"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--bg-card)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : detail.play_urls.length > 0 ? (
                  <div>
                    <p
                      className="text-[10px] font-medium mb-2 uppercase tracking-wider"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      选择播放源
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {detail.play_urls.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPlayUrl(p.url)}
                          className="rounded-xl border px-3.5 py-2.5 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--bg-card)",
                          }}
                        >
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              background: "var(--bg-hover)",
                              color: "var(--accent)",
                            }}
                          >
                            {p.name}
                          </span>
                          <p
                            className="text-[10px] mt-1.5 truncate"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {p.url.replace(/https?:\/\//, "").substring(0, 40)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-xl border p-5 text-center"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      暂无播放地址
                    </p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      该视频源可能不包含此资源
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
