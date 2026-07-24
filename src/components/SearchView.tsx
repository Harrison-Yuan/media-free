import { useEffect, useRef, useState } from "react";
import type { VideoItem, Category } from "../types";
import { CORE_CATEGORIES } from "../types";
import { fetchCategories, searchVideo } from "../lib/api";
import { posterFallbackStyle } from "../lib/utils";
import { SidebarMenu } from "./SidebarMenu";
import { SearchBar } from "./SearchBar";
import { CategoryFilter } from "./CategoryFilter";

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

  // ── Sidebar / browse state ──
  const [categories, setCategories] = useState<Category[]>(CORE_CATEGORIES);
  const [activeCat, setActiveCat] = useState<Category | null>(null);
  const [activeL2TypeId, setActiveL2TypeId] = useState<number | null>(null);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [homeActive, setHomeActive] = useState(true);
  const [homeResults, setHomeResults] = useState<VideoItem[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homePage, setHomePage] = useState(1);
  const [homeHasMore, setHomeHasMore] = useState(true);
  const [catResults, setCatResults] = useState<VideoItem[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearched, setCatSearched] = useState(false);
  const [catPage, setCatPage] = useState(1);
  const [catHasMore, setCatHasMore] = useState(true);

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  // ── 首页自动加载热门内容 ──
  // 策略：调用 ac=list 不传关键字和分类，API 返回全站最新内容（跨分类）
  // 支持无限滚动翻页
  useEffect(() => {
    setHomeLoading(true);
    setHomePage(1);
    setHomeHasMore(true);
    searchVideo("", undefined, 1)
      .then((result) => {
        setHomeResults(result.items);
        setHomeHasMore(result.items.length >= 20);
      })
      .catch(() => setHomeResults([]))
      .finally(() => setHomeLoading(false));
  }, []);

  const handleHomeClick = () => {
    setHomeActive(true);
    setActiveCat(null);
    setActiveL2TypeId(null);
    setActiveArea(null);
    setActiveYear(null);
    onHome(); // 重置父级搜索状态，确保首页正常渲染
    // 重新加载首页内容
    setHomeLoading(true);
    setHomePage(1);
    setHomeHasMore(true);
    searchVideo("", undefined, 1)
      .then((result) => {
        setHomeResults(result.items);
        setHomeHasMore(result.items.length >= 20);
      })
      .catch(() => setHomeResults([]))
      .finally(() => setHomeLoading(false));
  };

  const handleCatClick = async (cat: Category) => {
    setHomeActive(false);
    setActiveCat(cat);
    setActiveL2TypeId(null); // 切换一级分类时重置二级筛选
    setActiveArea(null);
    setActiveYear(null);
    setCatLoading(true);
    setCatSearched(true);
    setCatPage(1);
    setCatHasMore(true);
    onHome(); // 重置父级搜索状态，确保分类浏览正常渲染
    try {
      // 使用分类名作为关键字搜索全站（不限制 type_id），兼容各平台不同的分类映射
      const r = await searchVideo(cat.type_name, undefined, 1);
      setCatResults(r.items);
      setCatHasMore(r.items.length >= 20);
    } catch {
      setCatResults([]);
      setCatHasMore(false);
    } finally {
      setCatLoading(false);
    }
  };

  /** 执行分类浏览搜索（合并二级分类/地区/年份等筛选条件） */
  const doCatSearch = async (
    _l2TypeId: number | null,
    area: string | null,
    year: number | null,
  ) => {
    if (!activeCat) return;
    setCatLoading(true);
    setCatSearched(true);
    setCatPage(1);
    setCatHasMore(true);
    onHome();
    try {
      // 使用分类名 + 可选筛选条件，不限制 type_id 以兼容各平台
      const r = await searchVideo(
        activeCat.type_name,
        undefined,
        1,
        area ?? undefined,
        year ?? undefined,
      );
      setCatResults(r.items);
      setCatHasMore(r.items.length >= 20);
    } catch {
      setCatResults([]);
      setCatHasMore(false);
    } finally {
      setCatLoading(false);
    }
  };

  /** 二级分类筛选回调 */
  const handleL2Select = (l2TypeId: number | null) => {
    setActiveL2TypeId(l2TypeId);
    doCatSearch(l2TypeId, activeArea, activeYear);
  };

  /** 地区筛选回调 */
  const handleAreaSelect = (area: string | null) => {
    setActiveArea(area);
    doCatSearch(activeL2TypeId, area, activeYear);
  };

  /** 年份筛选回调 */
  const handleYearSelect = (year: number | null) => {
    setActiveYear(year);
    doCatSearch(activeL2TypeId, activeArea, year);
  };

  // ── 首页加载更多 ──
  const loadMoreHome = () => {
    if (homeLoading) return;
    const nextPage = homePage + 1;
    setHomePage(nextPage);
    setHomeLoading(true);
    searchVideo("", undefined, nextPage)
      .then((result) => {
        setHomeResults((prev) => [...prev, ...result.items]);
        setHomeHasMore(result.items.length >= 20);
      })
      .catch(() => setHomeHasMore(false))
      .finally(() => setHomeLoading(false));
  };

  // ── 分类浏览加载更多 ──
  const loadMoreCat = () => {
    if (catLoading || !activeCat) return;
    const nextPage = catPage + 1;
    setCatPage(nextPage);
    setCatLoading(true);
    searchVideo(activeCat.type_name, activeCat.type_id, nextPage)
      .then((result) => {
        setCatResults((prev) => [...prev, ...result.items]);
        setCatHasMore(result.items.length >= 20);
      })
      .catch(() => setCatHasMore(false))
      .finally(() => setCatLoading(false));
  };

  // ── Infinite scroll ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    // 根据当前视图决定用哪个 hasMore 和加载函数
    const isHomeView = homeActive && !activeCat && !searched && !searching;
    const isCatView = !!activeCat && !searched && !searching;
    let activeHasMore: boolean;
    let activeLoader: () => void;
    if (isHomeView) {
      activeHasMore = homeHasMore;
      activeLoader = loadMoreHome;
    } else if (isCatView) {
      activeHasMore = catHasMore;
      activeLoader = loadMoreCat;
    } else {
      activeHasMore = hasMore;
      activeLoader = loadMore;
    }
    if (!activeHasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) activeLoader();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    hasMore,
    loadMore,
    homeHasMore,
    catHasMore,
    homeActive,
    activeCat,
    searched,
    searching,
    loadMoreHome,
    loadMoreCat,
  ]);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden animate-fade-in"
      style={{ background: "var(--background)" }}
    >
      <SidebarMenu
        categories={categories}
        activeCat={activeCat}
        homeActive={homeActive}
        onSelectHome={handleHomeClick}
        onSelectCat={handleCatClick}
      />

      {/* ── Right panel ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Search bar at top */}
        <div className="flex items-center gap-4 px-6 py-4">
          <SearchBar
            inputRef={inputRef}
            query={query}
            onQueryChange={onQueryChange}
            onSearch={() => onSearch(query)}
          />
          {/* Source health */}
          {(searched || searching) && (
            <div
              className="hidden items-center gap-2 text-[12px] sm:flex shrink-0"
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
          )}
        </div>

        {/* ── 多维筛选（在搜索栏下方，仅在一级分类选中时显示） ── */}
        {activeCat && !searched && !searching && (
          <CategoryFilter
            parentTypeId={activeCat.type_id}
            activeL2={activeL2TypeId}
            onL2Select={handleL2Select}
            activeArea={activeArea}
            onAreaSelect={handleAreaSelect}
            activeYear={activeYear}
            onYearSelect={handleYearSelect}
          />
        )}

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Initial / Home (no search, no category selected) ── */}
          {!searched &&
            !searching &&
            !currentTypeId &&
            homeActive &&
            !activeCat && (
              <>
                <div className="flex items-center gap-3 px-6 pb-3 pt-2">
                  <h2
                    className="text-[18px] font-bold tracking-tight"
                    style={{ color: "var(--foreground)" }}
                  >
                    热门推荐
                  </h2>
                </div>
                <div className="px-6 pb-8">
                  {homeLoading && homeResults.length === 0 ? (
                    <SkeletonGrid />
                  ) : homeResults.length > 0 ? (
                    <>
                      <ResultGrid items={homeResults} onSelect={onSelectItem} />
                      {/* Infinite scroll sentinel */}
                      <div
                        ref={sentinelRef}
                        className="mt-8 flex items-center justify-center pb-12"
                      >
                        {homeHasMore ? (
                          <div
                            className="flex items-center gap-2 text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            <span
                              className="inline-flex h-2 w-2 animate-pulse rounded-full"
                              style={{ background: "var(--primary)" }}
                            />
                            加载更多...
                          </div>
                        ) : homeResults.length > 0 ? (
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            已显示全部 {homeResults.length} 条
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <EmptyState />
                  )}
                </div>
              </>
            )}

          {/* ── Category results (browse) ── */}
          {activeCat && !searched && !searching && (
            <>
              <div className="flex items-center gap-3 px-6 pb-3 pt-2">
                <h2
                  className="text-[18px] font-bold tracking-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {activeCat.type_name}
                  {activeL2TypeId &&
                    categories.find((c) => c.type_id === activeL2TypeId) && (
                      <span
                        className="ml-2 text-[14px] font-normal"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        /{" "}
                        {
                          categories.find((c) => c.type_id === activeL2TypeId)
                            ?.type_name
                        }
                      </span>
                    )}
                </h2>
                {catSearched && !catLoading && (
                  <span
                    className="text-[13px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {catResults.length} 条结果
                  </span>
                )}
              </div>
              <div className="px-6 pb-8">
                {catLoading && catResults.length === 0 ? (
                  <SkeletonGrid />
                ) : catResults.length > 0 ? (
                  <>
                    <ResultGrid items={catResults} onSelect={onSelectItem} />
                    {/* Infinite scroll sentinel */}
                    <div
                      ref={sentinelRef}
                      className="mt-8 flex items-center justify-center pb-12"
                    >
                      {catHasMore ? (
                        <div
                          className="flex items-center gap-2 text-[12px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <span
                            className="inline-flex h-2 w-2 animate-pulse rounded-full"
                            style={{ background: "var(--primary)" }}
                          />
                          加载更多...
                        </div>
                      ) : catResults.length > 0 ? (
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          已显示全部 {catResults.length} 条
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <EmptyState />
                )}
              </div>
            </>
          )}

          {/* ── Search results ── */}
          {(searched || searching || currentTypeId) && (
            <div className="px-6 py-4">
              {/* Meta bar */}
              {!searching && results.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span
                    className="badge-premium"
                    style={{
                      background: "var(--blue-bg)",
                      color: "var(--blue)",
                    }}
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
                </div>
              )}

              {/* Searching skeleton */}
              {searching && (
                <>
                  <div
                    className="mb-4 flex items-center gap-2 text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span
                      className="inline-flex h-2 w-2 animate-pulse rounded-full"
                      style={{ background: "var(--primary)" }}
                    />
                    正在搜索中...
                  </div>
                  <SkeletonGrid />
                </>
              )}

              {/* Results grid */}
              {!searching && results.length > 0 && (
                <>
                  <ResultGrid items={results} onSelect={onSelectItem} />
                  {/* Infinite scroll sentinel */}
                  <div
                    ref={sentinelRef}
                    className="mt-8 flex items-center justify-center pb-12"
                  >
                    {hasMore ? (
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
                </>
              )}

              {/* Empty search */}
              {!searching && searched && results.length === 0 && (
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function SkeletonGrid() {
  return (
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
  );
}

function ResultGrid({
  items,
  onSelect,
}: {
  items: VideoItem[];
  onSelect: (item: VideoItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 stagger-enter">
      {items.map((item) => (
        <button
          key={`${item.source.name}-${item.id}`}
          onClick={() => onSelect(item)}
          className="group w-full text-left"
        >
          <div className="card-result">
            <div
              className="relative overflow-hidden"
              style={{ aspectRatio: "3/4" }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={posterFallbackStyle(item.title)}
              >
                <span className="text-4xl font-bold tracking-tight text-white/90">
                  {item.title.charAt(0)}
                </span>
              </div>
              {item.poster && (
                <img
                  src={item.poster}
                  alt={item.title}
                  className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    const src = img.src;
                    if (img.dataset?.retried || !src.startsWith("http://")) {
                      img.style.display = "none";
                      return;
                    }
                    img.dataset.retried = "1";
                    img.src = "https://" + src.slice(7);
                  }}
                />
              )}
              <div className="absolute left-2 top-2 z-10">
                <span className="badge-source">{item.source.name}</span>
              </div>
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
            <div className="space-y-1 p-3">
              <p
                className="text-[14px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--primary)] transition-colors duration-200"
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
  );
}

function EmptyState() {
  return (
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
        没有找到相关内容
      </p>
      <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
        换个分类试试
      </p>
    </div>
  );
}
