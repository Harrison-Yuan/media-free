import { type RefObject } from "react";

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  placeholder?: string;
}

export function SearchBar({
  inputRef,
  query,
  onQueryChange,
  onSearch,
  placeholder = "搜索电影、剧集、演员...",
}: Props) {
  return (
    <div className="w-full max-w-lg">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
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
          placeholder={placeholder}
          className="input-search"
        />
      </div>
    </div>
  );
}
