import { useRef, useEffect, useState } from "react";
import Artplayer from "artplayer";
import type { Option } from "artplayer";
import artplayerPluginDanmuku, { type Danmu } from "artplayer-plugin-danmuku";
import Hls from "hls.js";
import { getProxyPort } from "../lib/api";

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
  const hlsRef = useRef<Hls | null>(null);
  const [proxyPort, setProxyPort] = useState(0);
  const [tunWarning, setTunWarning] = useState(false);

  useEffect(() => {
    getProxyPort().then(setProxyPort);
    // 检测虚拟网卡模式代理
    import("../lib/api").then(({ checkProxyMode }) =>
      checkProxyMode().then((info) => {
        if (info.has_tun) setTunWarning(true);
      }),
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !url) return;

    // 确保容器为空，防止重复初始化
    container.innerHTML = "";

    // 标记是否已销毁，防止闭包中的异步操作修改已销毁的实例
    let destroyed = false;

    const ref = referer || domain(url);
    const isHls = isM3u8(url);
    let blobFallbackTried = false;

    // 弹幕加载器
    const danmakuLoader = async (): Promise<Danmu[]> => {
      const t = titleRef.current;
      const ep = epRef.current;
      if (!t) return [];

      const danmu = await fetchDanmaku(t, ep || "");
      // 确保所有弹幕为滚动模式
      danmu.forEach((d) => (d.mode = 0));
      if (danmu.length > 0) {
        console.log(`[danmaku] loaded ${danmu.length} items for "${t}"`);
      }
      return danmu as Danmu[];
    };

    const option: Option = {
      container,
      url,
      type: detectType(url),
      lang: "zh-cn",
      theme: "#007aff",
      volume: 0.7,
      autoplay: true,
      autoSize: true,
      autoMini: true,
      backdrop: true,
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
        disablePictureInPicture: false,
      },
      // ── HLS：hls.js + 自定义 Referer + 绕过系统代理 ──
      ...(isHls
        ? {
            customType: {
              m3u8: function (
                video: HTMLVideoElement,
                m3u8Url: string,
                art: Artplayer,
              ) {
                // 优先使用浏览器原生 HLS 支持（macOS WKWebView/Safari）
                // 原生 HLS 无 MSE 音频 bug，pause 正常，无需代理
                if (video.canPlayType("application/vnd.apple.mpegurl")) {
                  video.src = m3u8Url;
                  return;
                }

                // 无原生 HLS 时（Windows WebView2），使用 hls.js + 代理
                if (Hls.isSupported()) {
                  // 如果代理可用，用自定义 Loader 将所有请求路由到本地代理
                  const proxyBase =
                    proxyPort > 0
                      ? `http://127.0.0.1:${proxyPort}/proxy?url=`
                      : null;

                  const hlsConfig: Record<string, any> = {
                    enableWorker: false,
                    backbufferLength: 15,
                    maxBufferLength: 30,
                    xhrSetup: (xhr: XMLHttpRequest) => {
                      xhr.setRequestHeader("Referer", ref);
                      xhr.setRequestHeader("Origin", ref.replace(/\/+$/, ""));
                    },
                  };

                  if (proxyBase) {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    const DefaultLoader = (Hls as any).DefaultConfig?.loader;
                    if (DefaultLoader) {
                      hlsConfig.loader = class HlsProxyLoader {
                        private loader: any;
                        constructor(config: any) {
                          this.loader = new DefaultLoader(config);
                        }
                        load(context: any, cfg: any, callbacks: any) {
                          if (!context.url.startsWith("http://127.0.0.1:")) {
                            context.url =
                              proxyBase + encodeURIComponent(context.url);
                          }
                          this.loader.load(context, cfg, callbacks);
                        }
                        abort() {
                          this.loader.abort();
                        }
                        destroy() {
                          this.loader.destroy();
                        }
                        get stats() {
                          return this.loader.stats;
                        }
                      };
                    }
                  }

                  const hls = new Hls(hlsConfig);
                  hlsRef.current = hls;
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
                }
              },
            },
          }
        : {}),
      plugins: [
        artplayerPluginDanmuku({
          danmuku: danmakuLoader,
          speed: 3,
          opacity: 0.8,
          fontSize: 20,
          margin: [10, 100],
          antiOverlap: true,
          synchronousPlayback: true,
          mode: 0,
          modes: [0],
          visible: true,
          emitter: false,
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

    // ── hls.js 暂停：停止加载 + 清除 MediaSource 缓冲 ──
    art.on("pause", () => {
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
      }
      const video = art.video;
      if (video && !video.paused) {
        video.pause();
      }
      if (hlsRef.current) {
        try {
          const ms = (hlsRef.current as any).mediaSource;
          if (ms?.sourceBuffers) {
            for (let i = 0; i < ms.sourceBuffers.length; i++) {
              const sb = ms.sourceBuffers[i];
              if (sb.buffered.length > 0) {
                sb.abort();
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
    });
    art.on("play", () => {
      if (hlsRef.current) {
        hlsRef.current.startLoad();
      }
    });

    // ── 错误处理 + 非 m3u8 blob 降级 ──
    art.on("video:error", async (err) => {
      if (destroyed) return;
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
      hlsRef.current = null;
      artRef.current = null;
      danmukuRef.current = null;
    });

    return () => {
      destroyed = true;
      if (artRef.current) {
        // 先暂停确保音频停止，再销毁
        try {
          artRef.current.pause();
        } catch {
          /* ignore */
        }
        artRef.current.destroy(true);
        artRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, referer]);

  return (
    <>
      {tunWarning && (
        <div
          className="absolute left-0 right-0 top-0 z-50 flex items-center gap-3 px-4 py-2 text-[12px]"
          style={{
            background: "rgba(255,149,0,0.92)",
            color: "white",
          }}
        >
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span className="flex-1 leading-relaxed">
            检测到虚拟网卡模式代理（如 Clash TUN、Surge），可能影响视频加载。
            请尝试
            <span
              className="font-semibold underline cursor-pointer"
              onClick={() => setTunWarning(false)}
            >
              关闭代理
            </span>
            ， 或在代理客户端中将视频 CDN 域名加入「直连/绕过」规则。
          </span>
          <button
            onClick={() => setTunWarning(false)}
            className="shrink-0 rounded p-0.5 transition-colors hover:bg-white/20"
            aria-label="关闭提示"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
      <div ref={containerRef} className="relative h-full w-full bg-black" />
    </>
  );
}
