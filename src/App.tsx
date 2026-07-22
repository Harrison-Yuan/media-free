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
    // 从搜索结果直接构建详情，零额外 HTTP 等待
    const detailFromSearch: VideoDetail = {
      id: item.id,
      title: item.title,
      poster: item.poster,
      description: item.description,
      source_name: item.source.name,
      episodes: item.episodes,
      source_groups: item.source_groups,
    };
    setDetail(detailFromSearch);
    setPlaying(null);

    // 后台异步获取完整详情（含跨源聚合），不影响用户立即看到页面
    try {
      const d = await getVideoDetail(
        item.source.name,
        item.source.api_url,
        item.id,
      );
      // 仅当用户没有切换到其他视频时更新
      setDetail((prev) => {
        if (prev?.id === item.id && prev?.source_name === item.source.name) {
          return d;
        }
        return prev;
      });
    } catch {
      // 后台失败不提示，主源数据已可用
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
