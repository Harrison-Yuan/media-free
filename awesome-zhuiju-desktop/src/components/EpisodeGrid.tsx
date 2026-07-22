import type { EpisodeItem } from "../types";

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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-[18px] w-[3px] rounded-full"
            style={{ background: "var(--primary)" }}
          />
          <h2
            className="text-[13px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            {playing ? "切换剧集" : "剧集列表"}
          </h2>
        </div>
        {episodes.length > 30 && (
          <button
            onClick={onToggleShowAll}
            className="rounded-full border px-3 py-1 text-[12px] font-medium transition-all duration-200 active:scale-[0.97]"
            style={{
              borderColor: "var(--border)",
              color: "var(--primary)",
            }}
          >
            {showAll ? "收起" : `全部 ${episodes.length} 集`}
          </button>
        )}
      </div>

      {episodes.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
            {displayedEps.map((e, i) => {
              const isActive = playing === e.url;
              return (
                <button
                  key={`${e.url}-${i}`}
                  onClick={() => onPlay(e.url, e.label)}
                  className="group relative overflow-hidden rounded-lg border text-center transition-all duration-200 active:scale-[0.96]"
                  style={{
                    borderColor: isActive
                      ? "var(--primary)"
                      : "var(--border)",
                    background: isActive
                      ? "rgba(0,122,255,0.06)"
                      : "var(--card)",
                    boxShadow: isActive
                      ? "0 2px 12px rgba(0,122,255,0.12)"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.background = "var(--secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--card)";
                    }
                  }}
                >
                  <div className="px-2 py-2">
                    <span
                      className="text-[12px] font-semibold"
                      style={{
                        color: isActive
                          ? "var(--primary)"
                          : "var(--foreground)",
                      }}
                    >
                      {e.label}
                    </span>
                  </div>
                  {isActive && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[2px]"
                      style={{ background: "var(--primary)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {!showAll && episodes.length > 30 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={onToggleShowAll}
                className="rounded-full border px-5 py-2 text-[13px] font-medium transition-all duration-200 active:scale-[0.97]"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--primary)",
                }}
              >
                展开全部 {episodes.length} 集
              </button>
            </div>
          )}
        </>
      ) : (
        <p
          className="py-8 text-center text-[13px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          暂无剧集信息
        </p>
      )}
    </section>
  );
}
