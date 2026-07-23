import type { EpisodeItem } from "../types";
import { cleanEpisodeLabel } from "../lib/utils";

interface Props {
  episodes: EpisodeItem[];
  displayedEps: EpisodeItem[];
  playing: string | null;
  showAll: boolean;
  onPlay: (url: string, label: string) => void;
  onToggleShowAll: () => void;
}

export function EpisodeGrid({
  episodes,
  displayedEps,
  playing,
  showAll,
  onPlay,
  onToggleShowAll,
}: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-[14px] w-[2px] rounded-full"
            style={{ background: "var(--primary)" }}
          />
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            {playing ? "切换剧集" : "剧集列表"}
          </h2>
        </div>
        {episodes.length > 30 && (
          <button
            onClick={onToggleShowAll}
            className="rounded px-2 py-0.5 text-[11px] font-medium transition-all duration-200 active:scale-[0.95]"
            style={{
              border: "1px solid var(--border)",
              color: "var(--primary)",
              background: "var(--card)",
              boxShadow: "var(--shadow-3d-sm)",
            }}
          >
            {showAll ? "收起" : `全部${episodes.length}集`}
          </button>
        )}
      </div>

      {episodes.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {displayedEps.map((e, i) => {
              const isActive = playing === e.url;
              return (
                <button
                  key={`${e.url}-${i}`}
                  onClick={() => onPlay(e.url, e.label)}
                  className="relative rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200 active:scale-[0.92]"
                  style={{
                    border: isActive
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: isActive
                      ? "rgba(0,122,255,0.06)"
                      : "var(--card)",
                    color: isActive ? "var(--primary)" : "var(--foreground)",
                    boxShadow: isActive
                      ? "0 2px 8px rgba(0,122,255,0.15), 0 1px 3px rgba(0,122,255,0.08)"
                      : "var(--shadow-3d-sm)",
                    transform: isActive ? "scale(1.02)" : "scale(1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.background = "var(--card)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 12px rgba(0,122,255,0.12), var(--shadow-3d-sm)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--card)";
                      e.currentTarget.style.boxShadow = "var(--shadow-3d-sm)";
                      e.currentTarget.style.transform = "scale(1)";
                    }
                  }}
                >
                  {cleanEpisodeLabel(e.label)}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                      style={{ background: "var(--primary)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {!showAll && episodes.length > 30 && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={onToggleShowAll}
                className="rounded-full px-4 py-1.5 text-[12px] font-medium transition-all duration-200 active:scale-[0.95]"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--primary)",
                  background: "var(--card)",
                  boxShadow: "var(--shadow-3d-sm)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(0,122,255,0.15)";
                  e.currentTarget.style.borderColor = "var(--primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "var(--shadow-3d-sm)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                展开全部 {episodes.length} 集
              </button>
            </div>
          )}
        </>
      ) : (
        <p
          className="py-6 text-center text-[13px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          暂无剧集信息
        </p>
      )}
    </section>
  );
}
