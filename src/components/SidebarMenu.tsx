import type { Category } from "../types";

interface Props {
  categories: Category[];
  activeCat: Category | null;
  homeActive: boolean;
  onSelectHome: () => void;
  onSelectCat: (cat: Category) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  电影: "M7 4v16l13-8z",
  电视剧:
    "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  综艺: "M5 3l14 9-14 9V3z",
  动漫: "M12 2l5.5 9h-11L12 2zm0 4.84L9.17 9h5.66L12 6.84zM12 22c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-2c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6z",
  短剧: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
};

function iconPath(name: string): string {
  return CATEGORY_ICONS[name] || "M7 4v16l13-8z";
}

export function SidebarMenu({
  categories,
  activeCat,
  homeActive,
  onSelectHome,
  onSelectCat,
}: Props) {
  return (
    <aside
      className="flex shrink-0 flex-col overflow-hidden"
      style={{
        width: 200,
        borderRight: "1px solid var(--border)",
        background: "rgba(255,255,255,0.5)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
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
          className="text-[16px] font-bold tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          追剧
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div
          className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          导航
        </div>
        <div className="flex flex-col gap-1">
          {/* Home */}
          <button
            onClick={onSelectHome}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-200"
            style={{
              background: homeActive ? "rgba(0,122,255,0.08)" : "transparent",
              color: homeActive ? "var(--primary)" : "var(--foreground)",
            }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: homeActive ? "var(--blue-bg)" : "var(--secondary)",
              }}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </span>
            <span>首页</span>
          </button>
        </div>

        {/* Divider */}
        <div className="my-3 px-2">
          <div style={{ height: 1, background: "var(--border)" }} />
        </div>

        {/* Category section header */}
        <div
          className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          分类
        </div>
        <div className="flex flex-col gap-1">
          {categories
            .filter((cat) => cat.type_pid === 0)
            .map((cat) => {
            const isActive = !homeActive && activeCat?.type_id === cat.type_id;
            return (
              <button
                key={cat.type_id}
                onClick={() => onSelectCat(cat)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-200"
                style={{
                  background: isActive ? "rgba(0,122,255,0.08)" : "transparent",
                  color: isActive ? "var(--primary)" : "var(--foreground)",
                }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    background: isActive
                      ? "var(--blue-bg)"
                      : "var(--secondary)",
                  }}
                >
                  <svg
                    className="h-3.5 w-3.5"
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
                </span>
                <span>{cat.type_name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
