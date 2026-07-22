import { useState, type ImgHTMLAttributes } from "react";

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  aspectRatio?: string;
}

export function ImgWithFallback({ aspectRatio = "3/4", style, ...props }: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  return (
    <div style={{ aspectRatio, background: "var(--bg-secondary)", overflow: "hidden", position: "relative", ...style }}>
      {/* 加载中骨架 */}
      {status === "loading" && (
        <div className="skeleton" style={{ position: "absolute", inset: 0 }} />
      )}
      {/* 加载失败占位 */}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg className="w-7 h-7" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      {/* 图片 */}
      {status !== "error" && (
        <img
          {...props}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: status === "loading" ? "none" : "block" }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  );
}
