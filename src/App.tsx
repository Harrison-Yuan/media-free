import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { searchVideo, getVideoDetail } from "./lib/api";
import { toast, ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SearchView } from "./components/SearchView";
import { DetailView } from "./components/DetailView";
import type { VideoItem, VideoDetail, SearchUpdateEvent } from "./types";
import { mergeSearchResults } from "./lib/utils";
import "./App.css";

const PAGE_SIZE = 20;

function AppInner() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourcesTotal, setSourcesTotal] = useState(0);
  const [sourcesResponding, setSourcesResponding] = useState(0);
  const [currentTypeId, setCurrentTypeId] = useState<number | undefined>();
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

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
    setPlaying(null);
    setDetailLoading(true);

    try {
      const d = await getVideoDetail(
        item.source.name,
        item.source.api_url,
        item.id,
      );
      setDetail(d);
    } catch {
      toast("详情加载失败，请重试", "error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Keyboard shortcuts
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

  // ── Detail view ──
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
          onBack={() => {
            setDetail(null);
            setPlaying(null);
          }}
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
