<p align="center">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A+modern%2C+minimalist+app+icon+for+a+video+streaming+desktop+application+named+%22%E8%BF%BD%E5%89%A7%22+with+a+play+button+and+film+clapperboard+motif%2C+Apple-style+flat+design%2C+vibrant+blue+gradient+%23007aff+to+%235856d6+background%2C+white+foreground+symbol%2C+sleek+and+polished+high-end+look&image_size=square_hd" width="120" height="120" alt="追剧">
</p>

<h1 align="center">追剧 · Awesome 追剧</h1>

<p align="center">
  <strong>多源聚合视频搜索桌面应用</strong>
  <br>
  聚合多家视频资源站，搜你所想，看你想看
</p>

<p align="center">
  <a href="https://github.com/Harrison-Yuan/awesome-zhuiju-free/releases">
    <img src="https://img.shields.io/github/v/release/Harrison-Yuan/awesome-zhuiju-free?style=flat&label=最新版本&color=007aff" alt="Release">
  </a>
  <a href="https://github.com/Harrison-Yuan/awesome-zhuiju-free/actions/workflows/build.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/Harrison-Yuan/awesome-zhuiju-free/build.yml?style=flat&label=构建状态&color=34c759" alt="Build">
  </a>
  <a href="https://github.com/Harrison-Yuan/awesome-zhuiju-free/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat&color=ff9500" alt="License">
  </a>
  <img src="https://img.shields.io/badge/tauri-2.0-5856d6?style=flat" alt="Tauri">
  <img src="https://img.shields.io/badge/react-19-007aff?style=flat" alt="React">
  <img src="https://img.shields.io/badge/artplayer-5-ff2d55?style=flat" alt="ArtPlayer">
</p>

<p align="center">
  <a href="#features">功能</a> ·
  <a href="#screenshots">截图</a> ·
  <a href="#quick-start">快速开始</a> ·
  <a href="#tech-stack">技术栈</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#faq">常见问题</a>
</p>

---

## 功能

- **多源聚合搜索** — 同时搜索量子、非凡、红牛、短剧等多家资源站，结果聚合去重排序
- **分类发现** — 按电影、电视剧、综艺、动漫、短剧分类浏览，智能映射各源分类ID
- **ArtPlayer 最强播放器** — 集成 ArtPlayer 5，支持倍速、画中画、截图、AirPlay、弹幕
- **弹幕系统** — 接入弹弹play 弹幕接口，自动匹配当前视频弹幕
- **跨源剧集** — 自动聚合多源的剧集信息，一键切换播放源
- **增量搜索** — 先到先返，首批结果毫秒级展示，后续源逐步追加
- **源健康管理** — 自动检测源可用性，连续失败暂停查询，5分钟自动恢复
- **Apple HIG 设计** — 遵循 Apple 人机界面指南，明亮优雅的界面风格
- **跨平台** — 支持 macOS、Windows、Linux

## 截图

<!-- 截图区域，后续替换为真实截图 -->
```
搜索页       详情页       播放器
  ┌─┐        ┌─┐          ┌─┐
  │ │        │ │          │ │
  └─┘        └─┘          └─┘
```

## 快速开始

### 下载

从 [Releases](https://github.com/Harrison-Yuan/awesome-zhuiju-free/releases) 下载对应平台的最新版本：

| 平台 | 下载 |
|------|------|
| macOS Apple Silicon | `awesome-zhuiju-macos-arm64.dmg` |
| macOS Intel | `awesome-zhuiju-macos-x64.dmg` |
| Windows | `awesome-zhuiju-windows-x64.msi` |
| Linux | `awesome-zhuiju-linux-amd64.deb` / `.AppImage` |

### 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/Harrison-Yuan/awesome-zhuiju-free.git
cd awesome-zhuiju-free/awesome-zhuiju-desktop

# 2. 安装依赖
pnpm install

# 3. 开发模式
pnpm tauri dev

# 4. 构建生产版本
pnpm tauri build
```

**系统依赖**（Linux）：

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | [Tauri 2.0](https://v2.tauri.app) | 跨平台桌面应用 |
| 前端框架 | [React 19](https://react.dev) | UI 渲染 |
| 样式 | [Tailwind CSS v4](https://tailwindcss.com) | 原子化样式 |
| UI 组件 | [shadcn/ui](https://ui.shadcn.com) | 标准化组件 |
| 播放器 | [ArtPlayer 5](https://artplayer.org) | 视频播放 |
| 弹幕 | [artplayer-plugin-danmuku](https://github.com/zhw2590582/artplayer-plugin-danmuku) + [弹弹play](https://api.dandanplay.net) | 弹幕系统 |
| HLS | [hls.js](https://github.com/video-dev/hls.js) | m3u8 流支持 |
| 后端 | [Rust](https://www.rust-lang.org) + [reqwest](https://docs.rs/reqwest) | HTTP 客户端 |
| 数据格式 | Apple CMS (TVBox type=1) | 视频数据源 |

## 架构

```
┌─────────────────────────────────────────────────┐
│                   Tauri Desktop                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Rust    │  │  React   │  │  ArtPlayer   │  │
│  │  Backend  │◄─┤  Frontend│  │  + hls.js    │  │
│  │           │  │          │  │              │  │
│  │  Sources  │  │  Search  │  │  多码率自适应 │  │
│  │  Priority │  │  Detail  │  │  弹幕同步    │  │
│  │  Health   │  │  Browse  │  │  降级兜底    │  │
│  └─────┬─────┘  └────┬─────┘  └──────────────┘  │
└────────┼─────────────┼──────────────────────────┘
         │             │
    ┌────▼─────────────▼────┐
    │    Apple CMS 资源站    │
    │  量子 · 非凡 · 红牛    │
    │  短剧 · TVBox 发现    │
    └───────────────────────┘
```

### 数据流

```
用户搜索 ──→ search_video ──→ 并行查所有源
                │
        ┌───────┴────────┐
        │  Channel (mpsc) │
        └───────┬────────┘
                │
   ┌────────────┴────────────┐
   │ Phase 1: 等首个源有数据  │
   │ → 排序去重 → 立即返回     │
   ├─────────────────────────┤
   │ Phase 2: 后台继续收     │
   │ → emit("search-update") │
   └──────────┬──────────────┘
              │ 事件
   ┌──────────▼──────────┐
   │ 前端 listen + merge │
   └─────────────────────┘
```

## 数据源

应用聚合了以下 Apple CMS (TVBox type=1) 资源站：

| 数据源 | 类型 | 说明 |
|--------|------|------|
| 量子资源 | 内置 | 稳定，内容全面 |
| 非凡资源 | 内置 | 稳定，电影资源丰富 |
| 红牛资源 | 内置 | 稳定，支持多码率 |
| 短剧资源 | 内置 | 短剧专用 |
| TVBox 发现源 | 动态 | 从 TVBox 配置自动发现 |

> 所有数据均来自公开的 Apple CMS 接口，应用仅做聚合展示，不存储任何视频内容。

## 常见问题

<details>
<summary><strong>搜索不到结果怎么办？</strong></summary>

- 尝试更短的关键词
- 检查网络连接（部分资源站需要直连）
- 使用分类浏览代替关键词搜索
</details>

<details>
<summary><strong>视频播放失败？</strong></summary>

播放器有三级降级机制：
1. hls.js 播放（首选）
2. Safari 原生 HLS 降级
3. iframe 嵌入降级

如果仍然失败，可能是资源站的播放链接已失效，尝试切换其他来源。
</details>

<details>
<summary><strong>如何添加新的资源站？</strong></summary>

参考 [API.md](./API.md) 中的接口格式，在 `sources.rs` 的 `BUILTIN_SOURCES` 中添加入口，或提 issue 由社区维护映射表。
</details>

## 贡献

欢迎贡献！请查看 [API 文档](./API.md) 了解接口规范。

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送分支：`git push origin feat/amazing-feature`
5. 提交 Pull Request

## 许可证

[MIT](../LICENSE)

## 致谢

- [Apple CMS](https://github.com/magicblack/maccms10) — 视频数据标准
- [ArtPlayer](https://artplayer.org) — 优秀的播放器
- [弹弹play](https://www.dandanplay.com) — 弹幕数据
- [TVBox](https://github.com/CatVodTVOfficial/TVBoxOSC) — 资源发现
- [shadcn/ui](https://ui.shadcn.com) — UI 组件
