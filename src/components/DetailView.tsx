import { useState, useEffect } from "react";
import { VideoPlayer } from "./VideoPlayer";
import { EpisodeGrid } from "./EpisodeGrid";
import type { VideoDetail, EpisodeItem } from "../types";
import { getSourceDisplayName } from "../lib/utils";

interface Props {
  detail: VideoDetail;
  playing: string | null;
  onPlay: (url: string) => void;
}

export function DetailView({ detail, playing, onPlay }: Props) {
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
  const [drawerOpen, setDrawerOpen] = useState(true);

  const displayedEps = showAll ? episodes : episodes.slice(0, 30);

  // 自动播放第一集
  useEffect(() => {
    if (episodes.length > 0 && !playing) {
      const first = episodes[0];
      setPlayingLabel(first.label);
      setPlayKey((k) => k + 1);
      onPlay(first.url);
    }
    // 只在 episodes 变化时触发，不含 playing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes]);

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
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden animate-fade-in"
      style={{ background: "var(--background)" }}
    >
      {/* ── Main content: left-right layout ── */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* ── Left: Player area (flex-1 填充剩余空间) ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {playing ? (
            <div className="flex flex-1 items-center justify-center bg-black">
              <div className="h-full w-full max-h-full">
                <VideoPlayer
                  key={playKey}
                  url={playing}
                  title={detail.title}
                  episodeLabel={playingLabel}
                />
              </div>
            </div>
          ) : (
            <div
              className="relative flex flex-1 items-center justify-center overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
              }}
            >
              <div className="flex flex-col items-center gap-4">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <svg
                    className="ml-1 h-7 w-7"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <p
                  className="text-[14px] font-medium"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  选择剧集开始播放
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Drawer toggle button (absolute 覆盖在播放器上) ── */}
        <button
          onClick={() => setDrawerOpen((v) => !v)}
          className="group absolute z-30 flex items-center justify-center rounded-l-md transition-all duration-300 opacity-0 hover:opacity-100 border-sweep"
          style={{
            height: 64,
            width: 20,
            top: "50%",
            transform: "translateY(-50%)",
            right: drawerOpen ? 300 : 0,
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "var(--text-tertiary)",
            borderLeft: "1px solid rgba(255,255,255,0.5)",
            boxShadow: drawerOpen ? "-2px 0 12px rgba(0,0,0,0.04)" : "none",
          }}
          title={drawerOpen ? "收起侧栏" : "展开侧栏"}
        >
          <svg
            className="h-4 w-4 transition-transform duration-300"
            style={{
              transform: drawerOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        {/* ── Right: Info drawer ── */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] glass-drawer"
          style={{
            width: drawerOpen ? 300 : 0,
            minWidth: drawerOpen ? 300 : 0,
            opacity: drawerOpen ? 1 : 0,
          }}
        >
          <div
            className="flex-1 overflow-y-auto stagger-enter"
            style={{
              padding: drawerOpen ? 20 : 0,
              minWidth: 300,
            }}
          >
            {/* ── Cover + Title row ── */}
            <div className="mb-4 flex items-start gap-4">
              {detail.poster && (
                <div
                  className="shrink-0"
                  style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.12))" }}
                >
                  <img
                    src={detail.poster}
                    alt={detail.title}
                    className="h-24 w-[72px] rounded-lg object-cover"
                    style={{ borderRadius: 10 }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1
                  className="text-[20px] font-bold leading-tight tracking-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {detail.title}
                </h1>
                {/* Badges */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: "var(--blue-bg)",
                      color: "var(--blue)",
                      border: "1px solid var(--blue-border)",
                      boxShadow: "var(--blue-shadow)",
                    }}
                  >
                    <svg
                      className="h-3 w-3"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
                    </svg>
                    {getSourceDisplayName(detail.source_name)}
                  </span>
                  {episodes.length > 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: "var(--secondary)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {episodes.length} 集
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            {detail.description && (
              <p
                className="mb-4 text-[13px] leading-relaxed line-clamp-3"
                style={{ color: "var(--muted-foreground)" }}
              >
                {detail.description.replace(/<[^>]+>/g, "")}
              </p>
            )}

            {/* ── Source dropdown ── */}
            {groups.length > 1 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-[14px] w-[2px] rounded-full"
                    style={{ background: "var(--primary)" }}
                  />
                  <span
                    className="text-[12px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    切换来源
                  </span>
                </div>
                <select
                  value={activeGroup}
                  onChange={(e) => handleSourceChange(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-[13px] font-medium outline-none transition-all duration-200"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                    boxShadow: "var(--shadow-3d-sm)",
                  }}
                >
                  {groups.map((g, i) => (
                    <option key={g.source_name} value={i}>
                      {getSourceDisplayName(g.source_name)} ({g.episodes.length}{" "}
                      集)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Episode Grid */}
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
      </main>
    </div>
  );
}
