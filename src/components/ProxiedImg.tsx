import { useEffect, useState } from "react";
import { getProxyPort } from "../lib/api";

interface Props {
  src: string;
  alt: string;
  title: string;
  className?: string;
  onError?: () => void;
}

/**
 * 海报图片组件
 *
 * 流式加载代理端口 → 使用代理 URL（no_proxy 绕过系统代理）
 * 代理失败 → 自动回退直连
 * 均失败 → 隐藏（父级已准备首字母占位）
 */
export function ProxiedImg({ src, alt, title, className, onError }: Props) {
  const [proxyPort, setProxyPort] = useState(0);
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  // 加载代理端口，可用时切换到代理 URL
  useEffect(() => {
    setImgSrc(src);
    setFailed(false);
    getProxyPort().then((port) => {
      setProxyPort(port);
      if (port > 0) {
        setImgSrc(
          `http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(src)}`,
        );
      }
    });
  }, [src]);

  const handleError = () => {
    // 代理 URL 加载失败 → 回退直连
    if (proxyPort > 0 && imgSrc !== src) {
      setImgSrc(src);
      return;
    }
    // 直连也失败 → 隐藏
    setFailed(true);
    onError?.();
  };

  if (failed) return null;

  return (
    <img
      src={imgSrc}
      alt={alt}
      title={title}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}
