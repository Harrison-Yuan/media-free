import { useRef, useEffect } from "react";
import Artplayer from "artplayer";
import type { Option } from "artplayer";
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import Hls from "hls.js";

interface Props {
  url: string;
  referer?: string;
  /** 视频标题（用于弹幕搜索） */
  title?: string;
  /** 当前剧集标签（用于弹幕匹配，如 "第01集"） */
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

/** 根据 URL 检测流媒体类型，ArtPlayer 运行时校验器强制要求 type 必须为字符串 */
function detectType(url: string): string {
  if (isM3u8(url)) return "m3u8";
  return "";
}

/**
 * ArtPlayer 视频播放器
 *
 * 功能：
 *   - ArtPlayer 核心（全功能 UI：设置、倍速、镜像、画幅、截图、画中画、全屏等）
 *   - HLS 流支持（含自定义 Referer 头）
 *   - 弹幕插件 (danmuku) + 弹弹play 弹幕自动匹配
 *   - iframe 降级兜底
 */
export function VideoPlayer({ url, referer, title, episodeLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const danmukuRef = useRef<any>(null);
  const titleRef = useRef(title);
  titleRef.current = title;
  const epRef = useRef(episodeLabel);
  epRef.current = episodeLabel;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !url) return;

    const ref = referer || domain(url);
    const isHls = isM3u8(url);

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
      moreVideoAttr: {
        playsInline: true,
      },
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

                  // 多码率 m3u8 → 注入清晰度切换
                  hls.on(Hls.Events.MANIFEST_PARSED, (_event) => {
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
                            if (idx >= 0) {
                              hls.currentLevel = idx;
                            }
                            return item.html;
                          },
                        });
                      } catch (_e) {
                        // setting.add 可能在播放器启动后不可用，静默忽略
                      }
                    }
                  });

                  // hls.js fatal 错误——销毁 hls，尝试 Safari 原生 HLS 兜底
                  hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                      console.error(
                        "[hls.js] fatal:",
                        data.type,
                        data.response,
                      );
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
          danmuku: [],
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

    // 仅记录日志——ArtPlayer 有内置错误 UI 和重试按钮，由用户自行点击剧集重试
    art.on("error", (err, reconnectTime) => {
      console.warn(
        "[ArtPlayer] error (reconnect #" + reconnectTime + "):",
        err,
      );
    });

    // 原生 video 元素错误记录，方便排查
    art.on("video:error", (err) => {
      const video = art.video;
      let detail = "";
      if (video?.error) {
        const code = video.error.code;
        const map: Record<number, string> = {
          1: "MEDIA_ERR_ABORTED",
          2: "MEDIA_ERR_NETWORK",
          3: "MEDIA_ERR_DECODE",
          4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
        };
        detail = `${map[code] || "UNKNOWN"}(${code})`;
      }
      console.warn("[video] error:", detail, err?.message);
    });

    art.on("destroy", () => {
      artRef.current = null;
      danmukuRef.current = null;
    });

    // ArtPlayer 就绪后，获取弹幕数据并加载到弹幕插件
    art.on("ready", async () => {
      const plugin = (art as any).plugins?.artplayerPluginDanmuku;
      if (plugin) {
        danmukuRef.current = plugin;
        await loadDanmaku(plugin);
      }
    });

    return () => {
      if (artRef.current) {
        artRef.current.destroy(false);
        artRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, referer]);

  // 当 title 或 episodeLabel 变化时，如果播放器已就绪则重新加载弹幕
  useEffect(() => {
    if (danmukuRef.current) {
      loadDanmaku(danmukuRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, episodeLabel]);

  async function loadDanmaku(plugin: any) {
    const t = titleRef.current;
    const ep = epRef.current;
    if (!t) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const danmu = await invoke<DanmuItem[]>("fetch_danmaku", {
        title: t,
        episodeLabel: ep || "",
      });
      if (danmu && danmu.length > 0 && plugin?.load) {
        await plugin.load(danmu);
        console.log(`[danmaku] loaded ${danmu.length} items for "${t}"`);
      }
    } catch (err) {
      console.debug("[danmaku] fetch skipped:", err);
    }
  }

  return <div ref={containerRef} className="h-full w-full bg-black" />;
}
