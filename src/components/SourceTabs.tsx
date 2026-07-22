import type { SourceGroup } from "../types";
import { getSourceDisplayName } from "../lib/utils";

interface Props {
  groups: SourceGroup[];
  activeGroup: number;
  onChange: (index: number) => void;
}

export function SourceTabs({ groups, activeGroup, onChange }: Props) {
  if (groups.length <= 1) return null;

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center gap-3">
        <div
          className="h-[18px] w-[3px] rounded-full"
          style={{ background: "var(--primary)" }}
        />
        <h2
          className="text-[13px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          切换来源
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((g, i) => {
          const active = i === activeGroup;
          return (
            <button
              key={g.source_name}
              onClick={() => onChange(i)}
              className="relative rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-[0.97]"
              style={{
                background: active ? "var(--primary)" : "var(--secondary)",
                borderColor: active ? "var(--primary)" : "var(--border)",
                color: active
                  ? "var(--primary-foreground)"
                  : "var(--secondary-foreground)",
              }}
            >
              {getSourceDisplayName(g.source_name)}
              <span className="ml-1.5 text-[11px] opacity-70">
                ({g.episodes.length})
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
