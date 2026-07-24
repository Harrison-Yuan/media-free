import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { searchVideo, getVideoDetail } from "./lib/api";
import { toast, ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SearchView } from "./components/SearchView";
import { DetailView } from "./components/DetailView";
import type { VideoItem, VideoDetail, SearchUpdateEvent } from "./types";
import { mergeSearchResults } from "./lib/utils";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./App.css";

const PAGE_SIZE = 20;

function AppInner() {
  // ── 检测是否是详情窗口（必须在 state 声明前，因为 detailLoading 初始化依赖此值） ──
  const params = new URLSearchParams(window.location.search);
  const isDetailWindow = params.get("detail") === "true";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourcesTotal, setSourcesTotal] = useState(0);
  const [sourcesResponding, setSourcesResponding] = useState(0);
  const [currentTypeId, setCurrentTypeId] = useState<number | undefined>();
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(isDetailWindow);
  const [playing, setPlaying] = useState<string | null>(null);

  // ── 详情窗口自动加载数据 ──
  useEffect(() => {
    if (!isDetailWindow) return;
    const id = params.get("id");
    const source = params.get("source");
    const api = params.get("api");
    if (!id || !source || !api) return;

    setDetailLoading(true);
    getVideoDetail(source, api, id)
      .then(setDetail)
      .catch(() => toast("详情加载失败", "error"))
      .finally(() => setDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 详情窗口渲染 ──
  if (isDetailWindow) {
    if (detailLoading) {
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

    if (detail) {
      return (
        <>
          <DetailView
            detail={detail}
            playing={playing}
            onPlay={(url) => setPlaying(url)}
          />
          <ToastContainer />
        </>
      );
    }

    // ── 详情加载失败降级 UI ──
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
          className="text-[13px] -mt-3"
          style={{ color: "var(--text-secondary)" }}
        >
          请检查网络连接后重试
        </p>
        <button
          onClick={() => window.location.reload()}
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

  // ── 主窗口 ──

  const doSearch = useCallback(async (q: string, typeId?: number) => {
    const keyword = q.trim();
    if (!keyword && typeId === undefined) return;
    setSearching(true);
    setSearched(true);
    setDetail(null);
    setPlaying(null);
    setCurrentTypeId(typeId);
    setDisplayCount(PAGE_SIZE);
    try {
      const r = await searchVideo(keyword, typeId, 1);
      setResults(r.items);
      setSourcesTotal(r.sources_total);
      setSourcesResponding(r.sources_responding);
    } catch {
      setResults([]);
      setSourcesTotal(0);
      setSourcesResponding(0);
      toast("搜索失败", "error");
    } finally {
      setSearching(false);
    }
  }, []);

  const displayedResults = results.slice(0, displayCount);
  const hasMore = displayCount < results.length;

  const openDetail = useCallback(async (item: VideoItem) => {
    const label = `detail-${item.id}`;

    // 如果已存在同标签窗口，聚焦（do nothing）
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return;
    }

    // 立即创建窗口，无需等待详情数据
    // 窗口自己会通过 URL 参数加载详情
    const detailWindow = new WebviewWindow(label, {
      url: `/?detail=true&id=${encodeURIComponent(item.id)}&source=${encodeURIComponent(item.source.name)}&api=${encodeURIComponent(item.source.api_url)}`,
      title: item.title,
      width: 1280,
      height: 800,
    });

    detailWindow.once("tauri://error", (err) => {
      console.error("[detail] window creation failed:", err);
    });
  }, []);

  // Keyboard shortcuts (仅主窗口生效)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (detail) {
          setDetail(null);
          setPlaying(null);
        }
      }
      if (e.key === "Escape") {
        if (playing) {
          setPlaying(null);
          return;
        }
        if (detail) {
          setDetail(null);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [playing, detail]);

  // 监听搜索结果增量推送
  useEffect(() => {
    const unlisten = listen<SearchUpdateEvent>("search-update", (event) => {
      const { items: newItems, sources_responding: sr } = event.payload;
      setResults((prev) => mergeSearchResults(prev, newItems));
      setSourcesResponding((prev) => Math.max(prev, sr));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleHome = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearching(false);
    setCurrentTypeId(undefined);
    setDisplayCount(PAGE_SIZE);
  }, []);

  const loadingRef = useRef(false);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, results.length));
    loadingRef.current = false;
  }, [results.length]);

  // ── Detail view (主窗口内联，搜索结果下方) ──
  if (detailLoading) {
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

  if (detail) {
    return (
      <>
        <DetailView
          detail={detail}
          playing={playing}
          onPlay={(url) => setPlaying(url)}
        />
        <ToastContainer />
      </>
    );
  }

  // ── Search / explore view ──
  return (
    <>
      <SearchView
        query={query}
        onQueryChange={setQuery}
        onSearch={doSearch}
        onHome={handleHome}
        searching={searching}
        searched={searched}
        results={displayedResults}
        sourcesTotal={sourcesTotal}
        sourcesResponding={sourcesResponding}
        currentTypeId={currentTypeId}
        onSelectItem={openDetail}
        loadMore={loadMore}
        hasMore={hasMore}
      />
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
