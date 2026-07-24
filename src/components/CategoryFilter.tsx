import { useEffect, useState } from "react";
import { fetchSubcategories } from "../lib/api";
import {
  getLocalSubCategories,
  SUB_CATEGORY_MAP,
  AREA_OPTIONS,
  YEAR_OPTIONS,
} from "../types";
import type { SubCategory } from "../types";

interface Props {
  /** 当前选中的一级分类 type_id */
  parentTypeId: number | null;
  /** 当前选中的二级分类 type_id（null = 全部） */
  activeL2: number | null;
  /** 二级分类选中回调（typeId = null 表示"全部"） */
  onL2Select: (typeId: number | null) => void;
  /** 当前选中的地区（null 表示全部） */
  activeArea: string | null;
  /** 地区筛选回调 */
  onAreaSelect: (area: string | null) => void;
  /** 当前选中的年份（null 表示全部） */
  activeYear: number | null;
  /** 年份筛选回调 */
  onYearSelect: (year: number | null) => void;
}

// ─── 通用筛选按钮 ──────────────────────────────────────────────────

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-200 active:scale-[0.95] whitespace-nowrap"
      style={{
        border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
        background: active ? "rgba(0,122,255,0.06)" : "var(--card)",
        color: active ? "var(--primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

// ─── 筛选组 —— 带标题 ─────────────────────────────────────────────

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="mr-0.5 text-[11px] font-semibold tracking-wider shrink-0"
        style={{ color: "var(--text-tertiary)", minWidth: 36 }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * 多维筛选组件
 *
 * 放置在搜索栏下方，包含三个筛选维度：
 *   1. 子分类 — 当前一级分类下的二级分类（如电影→喜剧片/爱情片...）
 *   2. 地区   — 按地区筛选（大陆/香港/美国...），所有资源通用
 *   3. 年份   — 按年份筛选（2026/2025...），所有资源通用
 *
 * 数据来源：
 *   - 子分类：优先从后端 fetch_subcategories 获取，不可用时用本地 SUB_CATEGORY_MAP 兜底
 *   - 地区/年份：前端本地映射表（AREA_OPTIONS / YEAR_OPTIONS）
 *
 * 可扩展性：
 *   - 新增维度 → 在 return 中加一个 <FilterGroup> 块
 *   - 新增子分类 → 只需在映射表（后端 PARENT_CATEGORY_MAP + 前端 SUB_CATEGORY_MAP）中加条目
 */
export function CategoryFilter({
  parentTypeId,
  activeL2,
  onL2Select,
  activeArea,
  onAreaSelect,
  activeYear,
  onYearSelect,
}: Props) {
  const [backendSubs, setBackendSubs] = useState<SubCategory[] | null>(null);
  const [_loading, setLoading] = useState(false);

  // ── 获取二级分类 ──
  useEffect(() => {
    if (parentTypeId == null) {
      setBackendSubs(null);
      return;
    }
    if (!(parentTypeId in SUB_CATEGORY_MAP)) {
      setBackendSubs([]);
      return;
    }
    setLoading(true);
    fetchSubcategories(parentTypeId)
      .then((data) => {
        setBackendSubs(
          data.map((d) => ({ type_id: d.type_id, type_name: d.type_name })),
        );
      })
      .catch(() => setBackendSubs(null))
      .finally(() => setLoading(false));
  }, [parentTypeId]);

  // 在没有一级分类时隐藏整个组件
  if (!parentTypeId) return null;

  // subs 逻辑：
  //   1. 后端返回数据 → 使用后端数据
  //   2. 后端返回空数组或不可用 → 使用本地兜底
  const subs: SubCategory[] =
    backendSubs !== null && backendSubs !== undefined
      ? backendSubs.length > 0
        ? backendSubs
        : getLocalSubCategories(parentTypeId)
      : getLocalSubCategories(parentTypeId);

  const hasSubFilter = subs.length > 0;

  return (
    <div className="px-6 py-0">
      <div className="flex flex-col gap-2 pb-3">
        {/* ── 子分类（当前一级分类下的二级分类） ── */}
        {hasSubFilter && (
          <FilterGroup label="子分类">
            <FilterBtn
              active={activeL2 === null}
              onClick={() => onL2Select(null)}
            >
              全部
            </FilterBtn>
            {subs.map((sub) => (
              <FilterBtn
                key={sub.type_id}
                active={activeL2 === sub.type_id}
                onClick={() => onL2Select(sub.type_id)}
              >
                {sub.type_name || String(sub.type_id)}
              </FilterBtn>
            ))}
          </FilterGroup>
        )}

        {/* ── 地区 ── */}
        <FilterGroup label="地区">
          <FilterBtn
            active={activeArea === null || activeArea === ""}
            onClick={() => onAreaSelect(null)}
          >
            全部
          </FilterBtn>
          {AREA_OPTIONS.map((area) => (
            <FilterBtn
              key={area}
              active={activeArea === area}
              onClick={() => onAreaSelect(area)}
            >
              {area}
            </FilterBtn>
          ))}
        </FilterGroup>

        {/* ── 年份 ── */}
        <FilterGroup label="年份">
          <FilterBtn
            active={activeYear === null}
            onClick={() => onYearSelect(null)}
          >
            全部
          </FilterBtn>
          {YEAR_OPTIONS.map((year) => (
            <FilterBtn
              key={year}
              active={activeYear === year}
              onClick={() => onYearSelect(year)}
            >
              {year}
            </FilterBtn>
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}
