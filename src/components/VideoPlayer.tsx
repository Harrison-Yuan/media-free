import { useRef, useEffect } from "react";
import Artplayer from "artplayer";
import type { Option } from "artplayer";
import artplayerPluginDanmuku, { type Danmu } from "artplayer-plugin-danmuku";
import Hls from "hls.js";

interface Props {
  url: string;
  referer?: string;
  title?: string;
  episodeLabel?: string;
}

interface DanmuItem {
  text: string;
  mode: number;
  color: string;
  time: number;
}

function isM3u8(url: string) {
  return url.includes(".m3u8");
}

function domain(url: string): string {
  try {
    return new URL(url).origin + "/";
  } catch {
    return "";
  }
}

function detectType(url: string): string {
  if (isM3u8(url)) return "m3u8";
  return "";
}

/** 从后端加载弹幕数据 */
async function fetchDanmaku(
  title: string,
  episodeLabel: string,
): Promise<DanmuItem[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<DanmuItem[]>("fetch_danmaku", {
      title,
      episodeLabel: episodeLabel || "",
    });
  } catch {
    return [];
  }
}

/**
 * 非 m3u8 资源兜底：用 fetch + Referer 头获取视频数据，转为 blob URL
 * 解决 CDN 因缺少 Referer 头而阻止 native <video> 请求的问题
 */
async function tryBlobFallback(
  videoUrl: string,
  ref: string,
): Promise<string | null> {
  try {
    const resp = await fetch(videoUrl, {
      headers: {
        Referer: ref,
        Origin: ref.replace(/\/+$/, ""),
      },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (
      !ct.startsWith("video/") &&
      !ct.startsWith("application/octet-stream")
    ) {
      // 非视频内容，不适用 blob 回退
      return null;
    }
    const blob = await resp.blob();
    if (blob.size < 1024) return null; // 太小的文件可能是错误页面
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function VideoPlayer({ url, referer, title, episodeLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const danmukuRef = useRef<any>(null);
  const titleRef = useRef(title);
  titleRef.current = title;
  const epRef = useRef(episodeLabel);
  epRef.current = episodeLabel;
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !url) return;

    const ref = referer || domain(url);
    const isHls = isM3u8(url);
    let blobFallbackTried = false;

    // 弹幕加载器
    let danmakuLoaded = false;
    const danmakuLoader = async (): Promise<Danmu[]> => {
      if (danmakuLoaded) return [];
      danmakuLoaded = true;
      const t = titleRef.current;
      const ep = epRef.current;
      if (!t) return [];
      const danmu = await fetchDanmaku(t, ep || "");
      console.log(
        `[danmaku] ${danmu.length > 0 ? `loaded ${danmu.length} items` : "no data"} for "${t}"`,
      );
      return danmu as Danmu[];
    };

    const option: Option = {
      container,
      url,
      type: detectType(url),
      theme: "#007aff",
      volume: 0.7,
      autoplay: true,
      autoSize: true,
      mutex: true,
      hotkey: true,
      pip: true,
      screenshot: true,
      setting: true,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      playsInline: true,
      airplay: true,
      lock: true,
      fastForward: true,
      gesture: true,
      moreVideoAttr: { playsInline: true },
      // ── HLS：hls.js + 自定义 Referer ──
      ...(isHls
        ? {
            customType: {
              m3u8: function (
                video: HTMLVideoElement,
                m3u8Url: string,
                art: Artplayer,
              ) {
                if (Hls.isSupported()) {
                  const hls = new Hls({
                    enableWorker: true,
                    xhrSetup: (xhr) => {
                      xhr.setRequestHeader("Referer", ref);
                      xhr.setRequestHeader("Origin", ref.replace(/\/+$/, ""));
                    },
                  });
                  hls.loadSource(m3u8Url);
                  hls.attachMedia(video);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    const levels = hls.levels;
                    if (levels && levels.length > 1) {
                      const selector = levels.map((l, i) => ({
                        html: l.name || `${l.height}p`,
                        selected: i === hls.currentLevel,
                      }));
                      try {
                        art.setting.add({
                          name: "quality",
                          html: "清晰度",
                          tooltip: selector[0].html,
                          selector,
                          onSelect: (item: any) => {
                            const idx = selector.indexOf(item);
                            if (idx >= 0) hls.currentLevel = idx;
                            return item.html;
                          },
                        });
                      } catch {
                        /* ignore */
                      }
                    }
                  });
                  hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                      console.error("[hls.js] fatal:", data);
                      hls.destroy();
                      if (video.canPlayType("application/vnd.apple.mpegurl")) {
                        video.src = m3u8Url;
                      }
                    }
                  });
                  art.on("destroy", () => hls.destroy());
                } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                  video.src = m3u8Url;
                }
              },
            },
          }
        : {}),
      plugins: [
        artplayerPluginDanmuku({
          danmuku: danmakuLoader,
          speed: 5,
          opacity: 0.8,
          fontSize: 20,
          margin: [10, 100],
          antiOverlap: true,
          synchronousPlayback: true,
        }),
      ],
    };

    const art = new Artplayer(option);
    artRef.current = art;

    // 插件引用
    art.on("ready", () => {
      const p = (art as any).plugins?.artplayerPluginDanmuku;
      if (p) danmukuRef.current = p;
    });

    // ── 错误处理 + 非 m3u8 blob 降级 ──
    art.on("video:error", async (err) => {
      const video = art.video;
      const code = video?.error?.code;
      const map: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      };
      console.warn(
        "[video] error:",
        code ? `${map[code] || "UNKNOWN"}(${code})` : "",
        err?.message,
      );

      // 非 m3u8 + 网络错误 → 尝试 blob 降级
      if (!isHls && !blobFallbackTried && (code === 2 || code === 4)) {
        blobFallbackTried = true;
        console.warn(
          "[player] non-m3u8 native failed, trying blob fallback...",
        );
        const blobUrl = await tryBlobFallback(url, ref);
        if (blobUrl) {
          blobUrlRef.current = blobUrl;
          art.video.src = blobUrl;
          art.play();
          console.log("[player] blob fallback succeeded");
        } else {
          console.warn(
            "[player] blob fallback also failed. The CDN likely requires the m3u8 source. Try switching source group.",
          );
        }
      }
    });

    art.on("destroy", () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      artRef.current = null;
      danmukuRef.current = null;
    });

    return () => {
      if (artRef.current) {
        artRef.current.destroy(false);
        artRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, referer]);

  // title/episodeLabel 变化时重新触发弹幕加载
  useEffect(() => {
    if (danmukuRef.current && danmukuRef.current.load) {
      const t = titleRef.current;
      const ep = epRef.current;
      if (!t) return;
      fetchDanmaku(t, ep || "").then((danmu) => {
        if (danmu.length > 0) danmukuRef.current?.load(danmu);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, episodeLabel]);

  return <div ref={containerRef} className="h-full w-full bg-black" />;
}
