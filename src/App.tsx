import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { searchVideo, getVideoDetail } from "./lib/api";
import { toast, ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SearchView } from "./components/SearchView";
import { DetailView } from "./components/DetailView";
import type { VideoItem, VideoDetail, SearchUpdateEvent } from "./types";
import { mergeSearchResults } from "./lib/utils";
import "./App.css";

function AppInner() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourcesTotal, setSourcesTotal] = useState(0);
  const [sourcesResponding, setSourcesResponding] = useState(0);
  const [currentTypeId, setCurrentTypeId] = useState<number | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const doSearch = useCallback(
    async (q: string, typeId?: number, page?: number) => {
      const keyword = q.trim();
      if (!keyword && typeId === undefined) return;
      setSearching(true);
      setSearched(true);
      setDetail(null);
      setPlaying(null);
      setCurrentTypeId(typeId);
      setCurrentPage(page ?? 1);
      try {
        const r = await searchVideo(keyword, typeId, page);
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
    },
    [],
  );

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
    setCurrentPage(1);
  }, []);

  const handleChangePage = useCallback(
    (page: number) => {
      doSearch(query, currentTypeId, page);
    },
    [doSearch, query, currentTypeId],
  );

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
        results={results}
        sourcesTotal={sourcesTotal}
        sourcesResponding={sourcesResponding}
        currentTypeId={currentTypeId}
        currentPage={currentPage}
        onSelectItem={openDetail}
        onChangePage={handleChangePage}
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
