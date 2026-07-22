# Apple CMS (TVBox type=1) 接口文档

> 基于 [官方源码头文件](https://github.com/magicblack/maccms10/blob/master/application/api/controller/Provide.php) + 对 4 个实际数据源的 curl/Python 测试验证。

## 基础 URL

```
{api_base}/?ac={action}&...
```

## 1. 内置数据源

### 1.1 测试验证结果

| 源名称 | 基础 URL | 网络可达 | 搜索可用 | `vod_pic` | 分类数 |
|--------|---------|---------|---------|-----------|--------|
| 非凡资源 | `http://cj.ffzyapi.com/api.php/provide/vod/at/json` | ✅ 直连可用 | ✅ | ❌ 不返回 | 31 |
| 量子资源 | `https://cj.lziapi.com/api.php/provide/vod/at/json` | ✅ 应用内可用 | ✅ | ✅ 返回 | ? |
| 红牛资源 | `https://www.hongniuzy2.com/api.php/provide/vod/at/json` | ✅ 应用内可用 | ✅ | ? | ? |
| 短剧资源 | `https://api.duanjuzy.com/api.php/provide/vod/at/json` | ✅ 应用内可用 | ✅ | ? | ? |

> **注意**：量子/红牛/短剧的 HTTPS CDN 存在 SSL 证书验证问题，Python 标准库无法直连。
> Tauri 的 Rust reqwest 客户端已配置 `danger_accept_invalid_certs(true)`，应用内正常。
> 各源在应用内的实际行为可通过 Rust 调试日志查看（搜索时终端输出 `has_vod_pic`）。

### 1.2 动态源（TVBox 配置解析）

| 配置地址 | 状态 |
|---------|------|
| `https://raw.liucn.cc/box/m.json` | ❌ 本环境不可达 |
| `https://bjq.catvod.site/` | ❌ 本环境不可达 |
| `https://file.alexlin1688.top/my_file/tvbox/alexlin_db06/ok_m01.json` | ❌ 本环境不可达 |
| `https://9280.kstore.vip/wex.json` | ❌ 本环境不可达 |
| `http://fmys.top/fmys.json` | ✅ 可达（82个站点，type=1=0） |

> 动态源在应用启动时自动解析，运行 `pnpm tauri dev` 后在终端能看到：
> ```
> [sources] N 个 type=1 XML API 源
> [量子资源] search: has_vod_pic=true, pic=https://...
> [非凡资源] search: has_vod_pic=false, pic=
> ```

---

## 2. API 参数参考

### 2.1 列表/搜索 `ac=list`

**端点**: `?ac=list`

#### 参数

| 参数 | 类型 | 必填 | 说明 | 测试结果 |
|------|------|------|------|---------|
| `wd` | string | 否 | 搜索关键词（LIKE 匹配 `vod_name`） | ✅ 全部支持 |
| `t` | int | 否 | 分类 ID（[见分类说明](#4-分类-class)） | ✅ 全部支持 |
| `pg` | int | 否 | 页码，默认 1 | ✅ 全部支持 |
| `pagesize` | int | 否 | 每页条数，默认 20，最大 100 | ✅ 全部支持 |
| `h` | int | 否 | 最近 N 小时内的数据 | ✅ 全部支持 |
| `year` | int/string | 否 | 年份，支持区间 `2022-2023` | ✅ 全部支持 |
| `isend` | int | 否 | 是否完结: `1`=已完结, `0`=未完结 | ✅ 全部支持 |
| `sort_direct` | string | 否 | `desc`=倒序(默认), `asc`=正序 | ✅ 全部支持 |
| `at` | string | 否 | 输出格式: `json`/`xml` | ✅ 全部支持 |

#### 实测用例（非凡资源）

```bash
# 搜索关键词
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&wd=庆余年&pagesize=2"

# 按分类浏览（国产剧 type_id=13）
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&pg=1&pagesize=12"

# 搜索 + 分类限定
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&wd=庆&t=13"

# 近 24 小时更新
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&h=24"
# → total=12

# 2025 年国产剧
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&year=2025"
# → total=634

# 已完结
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&isend=1"
# → total=8188

# 组合参数
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&pg=1&pagesize=5&sort_direct=desc&isend=0"
# → total=8188, limit=5

# XML 格式输出
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=list&t=13&pg=1&at=xml"
# → 有效 XML
```

#### 响应结构 (JSON)

```json
{
  "code": 1,
  "msg": "数据列表",
  "page": 1,
  "pagecount": 683,
  "limit": 12,
  "total": 8188,
  "list": [
    {
      "vod_id": 98730,
      "vod_name": "春日之地",
      "type_id": 13,
      "type_name": "国产剧",
      "vod_en": "chunrizhidi",
      "vod_time": "2026-07-21 12:33:32",
      "vod_remarks": "更新至第08集",
      "vod_play_from": "feifan,ffm3u8"
    }
  ],
  "class": [
    {"type_id": 1, "type_name": "电影片"},
    {"type_id": 2, "type_name": "连续剧"},
    ...
  ]
}
```

> **⚠️ 特别注意**：搜索列表接口**部分源不返回 `vod_pic`**（如非凡），前端的彩色渐变后备方案就是为了处理这个。

---

### 2.2 详情 `ac=detail`

**端点**: `?ac=detail`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ids` | string | 是 | 视频 ID，多个逗号分隔 |

**实测**：

```bash
# 非凡详情
curl "http://cj.ffzyapi.com/api.php/provide/vod/at/json?ac=detail&ids=66696"
```

详情接口返回的字段比搜索接口丰富：
- `vod_pic` — ✅ HTTPS 可用
- `vod_content` — 完整简介
- `vod_play_url` — 播放地址（`label$url#label$url` 格式）
- `vod_play_from` — 播放器来源
- `vod_pic_screenshot` / `vod_pic_slide` / `vod_pic_thumb` — 额外图片

---

## 3. 搜索接口 vs 详情接口字段差异

| 字段 | 搜索接口 `ac=list` | 详情接口 `ac=detail` |
|------|-------------------|---------------------|
| `vod_id` | ✅ | ✅ |
| `vod_name` | ✅ | ✅ |
| `vod_pic` | ❌ 部分源不返回 | ✅ |
| `vod_remarks` | ✅ | ✅ |
| `vod_content` | ❌ | ✅ |
| `vod_play_from` | ✅ | ✅ |
| `vod_play_url` | ❌ | ✅ |
| `vod_pic_screenshot` | ❌ | ✅ |
| `class`（分类列表） | ✅ | ❌ |

---

## 4. 分类 `class`

分类信息通过 `ac=list` 响应的 `class` 字段返回。**每个源的分类 ID 映射可能不同**。

### 非凡资源（31 个分类，实测）

```
type_id=1  电影片      type_id=2  连续剧
type_id=3  综艺片      type_id=4  动漫片
type_id=5  动作片      type_id=6  喜剧片
type_id=7  爱情片      type_id=8  科幻片
type_id=9  恐怖片      type_id=10 剧情片
type_id=11 战争片      type_id=12 国产剧
type_id=13 ...         ...
```

前端通过 `fetch_categories` 命令获取**当前各源聚合去重后的最新分类列表**。

---

## 5. 已知限制

| 能力 | 源支持情况 |
|------|-----------|
| `wd=` 文本搜索 | ✅ 全部支持 |
| `t=` 分类筛选 | ✅ 全部支持（但 type_id 映射不同） |
| `pg=` 分页 | ✅ 全部支持 |
| `pagesize=` 条数控制 | ✅ 全部支持（默认 20，最大 100） |
| `h=` 时间筛选 | ✅ 全部支持 |
| `year=` 年份筛选 | ✅ 全部支持 |
| `isend=` 完结状态 | ✅ 全部支持 |
| `sort_direct=` 排序 | ✅ 全部支持 |
| 搜索接口返回 `vod_pic` | ❌ 部分源（非凡）不返回 |
| `area=` 地区筛选 | ❌ 实测不支持 |
| `by=time\|hot` 排序模式 | ❌ 实测不支持 |
| `ac=videolist` 全字段列表 | ❌ 实测不确定 |
| `class=` 分类名筛选 | ❌ 实测不支持 |

---

## 6. 项目实现映射

| 功能 | 使用的 API 参数 | 代码位置 |
|------|----------------|---------|
| 搜索 | `ac=list&wd={keyword}&t={type_id}&pg={page}&pagesize=12` | [lib.rs](src-tauri/src/lib.rs#L210-L213) |
| 详情 | `ac=detail&ids={video_id}` | [lib.rs](src-tauri/src/lib.rs#L243-L245) |
| 分类列表 | `ac=list&t=1&pg=1`（提取 class 字段） | [lib.rs](src-tauri/src/lib.rs#L171-L199) |
| 源连通性检测 | `ac=list&t=1&pg=1` | [lib.rs](src-tauri/src/lib.rs#L153-L154) |
| 搜索去重 | 标准化标题后按 title 去重，有封面优先 | [lib.rs](src-tauri/src/lib.rs#L197-L208) |
| 海报 URL 修复 | 相对路径拼绝对路径（不做 HTTP→HTTPS） | [lib.rs](src-tauri/src/lib.rs#L369-L389) |
