import { useEffect, useRef, useState } from "react";
import type { VideoItem, Category } from "../types";
import { CORE_CATEGORIES } from "../types";
import { fetchCategories } from "../lib/api";
import { posterFallbackStyle } from "../lib/utils";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string, typeId?: number) => void;
  onHome: () => void;
  searching: boolean;
  searched: boolean;
  results: VideoItem[];
  sourcesTotal: number;
  sourcesResponding: number;
  currentTypeId?: number;
  onSelectItem: (item: VideoItem) => void;
  loadMore: () => void;
  hasMore: boolean;
}

// ─── Search Input ──────────────────────────────────────────────────────

function SearchInput({
  ref,
  value,
  onChange,
  onSearch,
  placeholder = "搜索电影、剧集、演员...",
}: {
  ref: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative" style={{ maxWidth: "640px" }}>
      <svg
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
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
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch();
        }}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border bg-white/80 pl-12 pr-24 text-[15px] font-medium outline-none backdrop-blur-xl transition-all duration-200 focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(0,122,255,0.1)]"
        style={{
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
        autoFocus
      />
      <button
        onClick={onSearch}
        className="absolute right-1.5 top-1/2 flex h-9 -translate-y-1/2 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition-all duration-200 hover:shadow-lg active:scale-[0.97]"
        style={{ background: "var(--gradient-hero)" }}
      >
        搜索
        <kbd
          className="hidden rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[11px] sm:inline-flex"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          ↵
        </kbd>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SearchView
// ═══════════════════════════════════════════════════════════════════════

export function SearchView({
  query,
  onQueryChange,
  onSearch,
  onHome,
  searching,
  searched,
  results,
  sourcesTotal,
  sourcesResponding,
  currentTypeId,
  onSelectItem,
  loadMore,
  hasMore,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Infinite scroll: 当 sentinel 进入可视区域时加载下一页 ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // ── Initial state (no search, no browse) ──
  if (!searched && !searching && !currentTypeId) {
    return (
      <InitialState
        query={query}
        onQueryChange={onQueryChange}
        onSearch={onSearch}
        inputRef={inputRef}
      />
    );
  }

  // ── Searching state ──
  if (searching) {
    return (
      <div
        className="flex h-screen w-screen flex-col overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <ResultsHeader
          query={query}
          onQueryChange={onQueryChange}
          onSearch={() => onSearch(query)}
          onHome={onHome}
          inputRef={inputRef}
          sourcesTotal={sourcesTotal}
          sourcesResponding={sourcesResponding}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1280px] px-6 py-8 sm:px-10 lg:px-16">
            <div
              className="mb-6 flex items-center gap-2 text-[13px]"
              style={{ color: "var(--text-secondary)" }}
            >
              <span
                className="inline-flex h-2 w-2 animate-pulse rounded-full"
                style={{ background: "var(--primary)" }}
              />
              正在搜索中...
            </div>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div
                    className="skeleton-shimmer w-full rounded-2xl"
                    style={{ aspectRatio: "3/4" }}
                  />
                  <div className="space-y-2 px-1">
                    <div className="skeleton-shimmer h-4 w-3/4 rounded-lg" />
                    <div className="skeleton-shimmer h-3 w-1/2 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Results state ──
  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--background)" }}
    >
      <ResultsHeader
        query={query}
        onQueryChange={onQueryChange}
        onSearch={() => onSearch(query)}
        onHome={onHome}
        inputRef={inputRef}
        sourcesTotal={sourcesTotal}
        sourcesResponding={sourcesResponding}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-6 py-8 sm:px-10 lg:px-16">
          {/* ── Meta bar ── */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold"
              style={{ background: "var(--blue-bg)", color: "var(--blue)" }}
            >
              {results.length} 条结果
            </span>
            <span
              className="text-[13px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              来自 {sourcesResponding}/{sourcesTotal} 个片源
            </span>
            {query && (
              <span
                className="text-[13px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                · 关键词 “{query}”
              </span>
            )}
            {currentTypeId && (
              <span
                className="text-[13px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                · 分类 #{currentTypeId}
              </span>
            )}
          </div>

          {/* ── Results grid ── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((item, i) => (
              <button
                key={`${item.source.name}-${item.id}`}
                onClick={() => onSelectItem(item)}
                className="group w-full animate-slide-up text-left"
                style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
              >
                <div
                  className="overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  {/* Poster */}
                  <div
                    className="relative overflow-hidden"
                    style={{ aspectRatio: "3/4" }}
                  >
                    {/* 后备：首字符 + 彩色渐变 */}
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={posterFallbackStyle(item.title)}
                    >
                      <span className="text-4xl font-bold tracking-tight text-white/90">
                        {item.title.charAt(0)}
                      </span>
                    </div>
                    {/* 封面图片：部分源搜索接口不返回 vod_pic，为空时不渲染 */}
                    {item.poster && (
                      <img
                        src={item.poster}
                        alt={item.title}
                        className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          const src = img.src;
                          if (
                            img.dataset?.retried ||
                            !src.startsWith("http://")
                          ) {
                            img.style.display = "none";
                            return;
                          }
                          img.dataset.retried = "1";
                          img.src = "https://" + src.slice(7);
                        }}
                      />
                    )}

                    {/* Source badge */}
                    <div className="absolute left-2 top-2 z-10">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: "rgba(255,255,255,0.85)",
                          color: "var(--foreground)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        {item.source.name}
                      </span>
                    </div>

                    {/* Remark badge */}
                    {item.remark && (
                      <div className="absolute right-2 top-2 z-10">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{
                            background: "rgba(0,0,0,0.5)",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          {item.remark}
                        </span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>

                  {/* Info */}
                  <div className="space-y-1 p-3">
                    <p
                      className="text-[14px] font-semibold leading-snug transition-colors duration-200 group-hover:text-[var(--primary)] line-clamp-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {item.source.name}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Empty state ── */}
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p
                className="mb-1 text-lg font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                没有找到相关结果
              </p>
              <p
                className="text-[14px]"
                style={{ color: "var(--text-secondary)" }}
              >
                试试更短的关键词，或换个分类浏览
              </p>
            </div>
          )}

          {/* ── Infinite scroll sentinel ── */}
          {results.length > 0 && (
            <div
              ref={sentinelRef}
              className="mt-8 flex items-center justify-center pb-12"
            >
              {searching ? (
                <div
                  className="flex items-center gap-2 text-[13px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <span
                    className="inline-flex h-2 w-2 animate-pulse rounded-full"
                    style={{ background: "var(--primary)" }}
                  />
                  加载更多...
                </div>
              ) : hasMore ? (
                <span
                  className="text-[12px]"
                  style={{ color: "var(--text-tertiary)" }}
                />
              ) : (
                <span
                  className="text-[12px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  已显示全部 {results.length} 条结果
                </span>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Initial State (browse mode)
// ═══════════════════════════════════════════════════════════════════════

function InitialState({
  query,
  onQueryChange,
  onSearch,
  inputRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string, typeId?: number, page?: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [categories, setCategories] = useState<Category[]>(CORE_CATEGORIES);
  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  const iconPath = (name: string): string => {
    const m: Record<string, string> = {
      电影: "M7 4v16l13-8z",
      电视剧:
        "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
      综艺: "M5 3l14 9-14 9V3z",
      动漫: "M12 2l5.5 9h-11L12 2zm0 4.84L9.17 9h5.66L12 6.84zM12 22c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-2c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6z",
      短剧: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
    };
    return m[name] || "M7 4v16l13-8z";
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--background)" }}
    >
      {/* ── Hero ── */}
      <section className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,122,255,0.12), transparent),
              radial-gradient(ellipse 60% 40% at 80% 60%, rgba(88,86,214,0.06), transparent),
              linear-gradient(180deg, #f5f5f7 0%, #ffffff 100%)
            `,
          }}
        />

        <div className="relative max-w-screen-xl px-6 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-xl text-center">
            {/* Badge */}
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5"
              style={{
                background: "rgba(255,255,255,0.7)",
                borderColor: "rgba(0,122,255,0.15)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: "var(--blue)" }}
              />
              <span
                className="text-[13px] font-semibold"
                style={{ color: "var(--blue)" }}
              >
                多源聚合影视搜索
              </span>
            </div>

            <h1
              className="mb-4 text-[42px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[56px] lg:text-[68px]"
              style={{ color: "var(--foreground)" }}
            >
              发现你喜欢的
              <br />
              <span
                style={{
                  background: "var(--gradient-hero)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                每一部好剧
              </span>
            </h1>

            <p
              className="mx-auto mb-8 max-w-xl text-[16px] leading-relaxed sm:text-[18px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              聚合多个片源，一次搜索全网影视。先选分类浏览，或直接搜索片名。
            </p>

            <div className="flex justify-center">
              <div
                className="rounded-2xl border bg-white/80 p-1.5 shadow-lg backdrop-blur-xl"
                style={{
                  borderColor: "rgba(255,255,255,0.6)",
                  width: "min(640px, 100%)",
                }}
              >
                <SearchInput
                  ref={inputRef}
                  value={query}
                  onChange={onQueryChange}
                  onSearch={() => onSearch(query)}
                  placeholder="输入片名、演员或关键词..."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Browse categories ── */}
      <main
        className="max-h-[50vh] shrink-0 overflow-y-auto border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-6 sm:px-10 lg:px-16">
          <section>
            <div className="mb-6 flex items-center gap-2">
              <div
                className="h-[18px] w-[3px] rounded-full"
                style={{ background: "var(--primary)" }}
              />
              <h2
                className="text-[13px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-secondary)" }}
              >
                按分类浏览
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {categories.map((cat) => (
                <button
                  key={cat.type_id}
                  onClick={() => onSearch("", cat.type_id)}
                  className="group rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: "var(--secondary)" }}
                  >
                    <svg
                      className="h-5 w-5"
                      style={{ color: "var(--primary)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={iconPath(cat.type_name)}
                      />
                    </svg>
                  </div>
                  <p
                    className="text-[15px] font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    {cat.type_name}
                  </p>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    浏览全部 {cat.type_name}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Results Header
// ═══════════════════════════════════════════════════════════════════════

function ResultsHeader({
  query,
  onQueryChange,
  onSearch,
  onHome,
  inputRef,
  sourcesTotal,
  sourcesResponding,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onHome: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  sourcesTotal: number;
  sourcesResponding: number;
}) {
  return (
    <header
      className="sticky top-0 z-50 flex-shrink-0 border-b"
      style={{
        background: "rgba(255,255,255,0.76)",
        borderColor: "var(--border)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      <div className="mx-auto max-w-[1280px] px-6 py-3 sm:px-10 lg:px-16">
        <div className="flex items-center gap-4">
          {/* Logo — 点击返回首页 */}
          <button
            onClick={onHome}
            className="flex shrink-0 items-center gap-2 cursor-pointer"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "var(--gradient-logo)" }}
            >
              <svg
                className="h-4 w-4 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <span
              className="hidden text-[16px] font-semibold tracking-tight sm:block"
              style={{ color: "var(--foreground)" }}
            >
              追剧
            </span>
          </button>

          {/* Search */}
          <div className="max-w-lg flex-1">
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
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
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearch();
                }}
                placeholder="搜索..."
                className="h-10 w-full rounded-xl border pl-10 pr-4 text-[14px] outline-none transition-all duration-200 focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_rgba(0,122,255,0.1)]"
                style={{
                  background: "var(--secondary)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>
          </div>

          {/* Source health */}
          <div
            className="hidden items-center gap-2 text-[12px] sm:flex"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    sourcesResponding > 0 ? "var(--green)" : "var(--red)",
                }}
              />
              {sourcesResponding}/{sourcesTotal}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
