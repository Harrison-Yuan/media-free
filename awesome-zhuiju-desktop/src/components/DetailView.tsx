import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "./VideoPlayer";
import { SourceTabs } from "./SourceTabs";
import { EpisodeGrid } from "./EpisodeGrid";
import type { VideoDetail, EpisodeItem } from "../types";
import { getSourceDisplayName, posterFallbackStyle } from "../lib/utils";

interface Props {
  detail: VideoDetail;
  playing: string | null;
  onPlay: (url: string) => void;
  onBack: () => void;
}

export function DetailView({ detail, playing, onPlay, onBack }: Props) {
  const groups = detail.source_groups;
  const defaultIdx = groups.findIndex(
    (g) => g.source_name === detail.source_name,
  );
  const [activeGroup, setActiveGroup] = useState(Math.max(0, defaultIdx));
  const currentGroup = groups[activeGroup];
  const episodes: EpisodeItem[] = currentGroup?.episodes ?? detail.episodes;
  const showAllEpisodes = episodes.length <= 30;

  const [showAll, setShowAll] = useState(showAllEpisodes);
  const [playingLabel, setPlayingLabel] = useState<string>("");
  const [playKey, setPlayKey] = useState(0);

  const displayedEps = showAll ? episodes : episodes.slice(0, 30);

  const handlePlay = (url: string, label: string) => {
    setPlayingLabel(label);
    setPlayKey((k) => k + 1);
    onPlay(url);
  };

  const handleSourceChange = (index: number) => {
    const prevLabel = playingLabel;
    setActiveGroup(index);
    const newGroup = groups[index];
    const epCount = newGroup?.episodes.length ?? 0;
    setShowAll(epCount <= 30);

    if (prevLabel && newGroup) {
      const sameEp = newGroup.episodes.find((ep) => ep.label === prevLabel);
      if (sameEp) {
        setPlayingLabel(sameEp.label);
        setPlayKey((k) => k + 1);
        onPlay(sameEp.url);
        return;
      }
    }
    // 没有匹配到相同剧集，不重置播放状态，等待用户手动选择
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden animate-fade-in"
      style={{ background: "var(--background)" }}
    >
      {/* ── Nav bar ── */}
      <header
        className="relative z-30 flex shrink-0 items-center gap-3 px-6 py-3 sm:px-10 lg:px-16"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-[13px]"
        >
          <svg
            className="h-4 w-4"
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
          </svg>
          返回
        </Button>
        <div className="flex-1" />
        <span
          className="text-[12px]"
          style={{ color: "var(--text-quaternary)" }}
        >
          ⌘K
        </span>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* ── Hero section ── */}
        <section className="relative">
          {detail.poster && (
            <>
              <div className="absolute inset-0 h-[480px] overflow-hidden">
                <img
                  src={detail.poster}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{
                    filter: "blur(60px) brightness(0.35) saturate(1.3)",
                    transform: "scale(1.1)",
                  }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.dataset?.retried || !img.src.startsWith("http://"))
                      return;
                    img.dataset.retried = "1";
                    img.src = "https://" + img.src.slice(7);
                  }}
                />
              </div>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 50%, var(--background) 100%)",
                }}
              />
            </>
          )}

          <div
            className="relative z-10 mx-auto px-6 pb-8 pt-10 sm:px-10 lg:px-16"
            style={{ maxWidth: "1100px" }}
          >
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
              {/* Poster */}
              <div className="relative w-full shrink-0 overflow-hidden rounded-xl shadow-2xl shadow-black/30 sm:w-[200px]">
                <div
                  className="flex w-full items-center justify-center"
                  style={{
                    aspectRatio: "3/4",
                    ...posterFallbackStyle(detail.title),
                  }}
                >
                  <span className="text-4xl font-bold tracking-tight text-white/90">
                    {detail.title.charAt(0)}
                  </span>
                </div>
                <img
                  src={detail.poster}
                  alt={detail.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (
                      img.dataset?.retried ||
                      !img.src.startsWith("http://")
                    ) {
                      img.style.display = "none";
                      return;
                    }
                    img.dataset.retried = "1";
                    img.src = "https://" + img.src.slice(7);
                  }}
                />
              </div>

              {/* Meta */}
              <div className="min-w-0 flex-1 pt-1">
                <h1 className="mb-3 text-[30px] font-bold leading-tight tracking-tight text-white sm:text-[38px] lg:text-[44px]">
                  {detail.title}
                </h1>
                <div className="mb-4 flex flex-wrap items-center gap-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold"
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "white",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
                    </svg>
                    {getSourceDisplayName(detail.source_name)}
                  </span>
                  {episodes.length > 0 && (
                    <span
                      className="rounded-full px-3 py-1 text-[13px] font-medium"
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.7)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {episodes.length} 集
                    </span>
                  )}
                </div>
                {detail.description && (
                  <p
                    className="max-w-xl text-[14px] leading-relaxed line-clamp-3"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {detail.description.replace(/<[^>]+>/g, "")}
                  </p>
                )}
              </div>
            </div>

            {/* ── 来源切换 + 剧集列表（在封面模块内，播放器上方） ── */}
            <div className="mt-8">
              <SourceTabs
                groups={groups}
                activeGroup={activeGroup}
                onChange={handleSourceChange}
              />
              <EpisodeGrid
                episodes={episodes}
                displayedEps={displayedEps}
                playing={playing}
                showAll={showAll}
                onPlay={handlePlay}
                onToggleShowAll={() => setShowAll(!showAll)}
              />
            </div>
          </div>
        </section>

        {/* ── Player — 全宽，无左右边距 ── */}
        {playing && (
          <div className="mb-8 mt-6 w-full">
            <div
              className="shadow-2xl shadow-black/10 animate-scale-in"
              style={{ background: "black" }}
            >
              <div
                className="w-full"
                style={{ aspectRatio: "16/9", maxHeight: "80vh" }}
              >
                <VideoPlayer
                  key={playKey}
                  url={playing}
                  title={detail.title}
                  episodeLabel={playingLabel}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
