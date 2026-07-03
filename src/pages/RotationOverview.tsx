import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Stethoscope,
  Heart,
  Activity,
  Brain,
  Eye,
  Baby,
  Bone,
  Pill,
  Microscope,
  Syringe,
  Sparkles,
  Inbox,
  CalendarCheck,
  UserCheck,
  ShieldCheck,
  Layers,
  Boxes,
  LayoutList,
  CheckCircle2,
} from "lucide-react";
import { useAllCurrentRotation } from "../hooks/useRotation";
import { useInterns } from "../hooks/useInterns";
import { useDepartments } from "../hooks/useDepartments";
import { RotationWithNames } from "../types";
import { formatDate } from "../lib/utils";

const colorPalette: Record<string, { bar: string; text: string; badge: string; barStrong: string; shadow: string; glow: string; lockedDot: string; headerAccent: string }> = {
  indigo: { bar: "bg-gradient-to-r from-indigo-400 to-indigo-500", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700", barStrong: "bg-gradient-to-br from-indigo-50 via-indigo-50 to-indigo-100", shadow: "shadow-indigo-200/30", glow: "ring-1 ring-inset ring-indigo-200/60", lockedDot: "bg-indigo-300/70", headerAccent: "bg-indigo-50" },
  rose: { bar: "bg-gradient-to-r from-rose-400 to-rose-500", text: "text-rose-700", badge: "bg-rose-100 text-rose-700", barStrong: "bg-gradient-to-br from-rose-50 via-rose-50 to-rose-100", shadow: "shadow-rose-200/30", glow: "ring-1 ring-inset ring-rose-200/60", lockedDot: "bg-rose-300/70", headerAccent: "bg-rose-50" },
  amber: { bar: "bg-gradient-to-r from-amber-400 to-amber-500", text: "text-amber-700", badge: "bg-amber-100 text-amber-700", barStrong: "bg-gradient-to-br from-amber-50 via-amber-50 to-amber-100", shadow: "shadow-amber-200/30", glow: "ring-1 ring-inset ring-amber-200/60", lockedDot: "bg-amber-300/70", headerAccent: "bg-amber-50" },
  emerald: { bar: "bg-gradient-to-r from-emerald-400 to-emerald-500", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", barStrong: "bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100", shadow: "shadow-emerald-200/30", glow: "ring-1 ring-inset ring-emerald-200/60", lockedDot: "bg-emerald-300/70", headerAccent: "bg-emerald-50" },
  violet: { bar: "bg-gradient-to-r from-violet-400 to-violet-500", text: "text-violet-700", badge: "bg-violet-100 text-violet-700", barStrong: "bg-gradient-to-br from-violet-50 via-violet-50 to-violet-100", shadow: "shadow-violet-200/30", glow: "ring-1 ring-inset ring-violet-200/60", lockedDot: "bg-violet-300/70", headerAccent: "bg-violet-50" },
  cyan: { bar: "bg-gradient-to-r from-cyan-400 to-cyan-500", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700", barStrong: "bg-gradient-to-br from-cyan-50 via-cyan-50 to-cyan-100", shadow: "shadow-cyan-200/30", glow: "ring-1 ring-inset ring-cyan-200/60", lockedDot: "bg-cyan-300/70", headerAccent: "bg-cyan-50" },
  orange: { bar: "bg-gradient-to-r from-orange-400 to-orange-500", text: "text-orange-700", badge: "bg-orange-100 text-orange-700", barStrong: "bg-gradient-to-br from-orange-50 via-orange-50 to-orange-100", shadow: "shadow-orange-200/30", glow: "ring-1 ring-inset ring-orange-200/60", lockedDot: "bg-orange-300/70", headerAccent: "bg-orange-50" },
  teal: { bar: "bg-gradient-to-r from-teal-400 to-emerald-500", text: "text-teal-700", badge: "bg-teal-100 text-teal-700", barStrong: "bg-gradient-to-br from-teal-50 via-teal-50 to-teal-100", shadow: "shadow-teal-200/30", glow: "ring-1 ring-inset ring-teal-200/60", lockedDot: "bg-teal-300/70", headerAccent: "bg-teal-50" },
};
const systemColorLookup: Record<string, string> = { "内科": "indigo", "外科": "rose" };
const colorNames = ["indigo", "rose", "amber", "emerald", "violet", "cyan", "orange", "teal"];

// 科室系统名 → 医疗主题图标(包含科室关键字,与 lucide-react 一一映射)
// 未命中关键字的兜底走 Activity;medical_keywords:内/外/妇/儿/眼/骨/神经/心/肿瘤/影像/口腔/ICU/急诊/检验/药剂/护理
const systemIconLookup: Record<string, any> = {
  "内科": Stethoscope,
  "外科": Activity,
  "妇产科": Baby,
  "儿科": Baby,
  "眼科": Eye,
  "骨科": Bone,
  "神经科": Brain,
  "心内科": Heart,
  "肿瘤科": Pill,
  "影像科": Microscope,
  "口腔科": Pill,
  "ICU": Syringe,
  "急诊科": Activity,
  "检验科": Microscope,
  "药剂科": Pill,
};

function getSystemIcon(systemName: string) {
  if (!systemName) return Stethoscope;
  return systemIconLookup[systemName] || Stethoscope;
}

// 给定 system_name 与 dept_name 输出一个 emoji 字符(纯文本兜底)
function getDeptEmoji(systemName: string, deptName: string): string {
  const s = (systemName || "").toLowerCase();
  const d = (deptName || "").toLowerCase();
  const text = (systemName || "") + (deptName || "");
  if (text.includes("心") || text.includes("cardio")) return "❤️";
  if (text.includes("内科")) return "🩺";
  if (text.includes("外科")) return "🩹";
  if (text.includes("儿") || text.includes("pediatric")) return "👶";
  if (text.includes("妇产") || text.includes("产")) return "🤰";
  if (text.includes("眼") || text.includes("oph")) return "👁️";
  if (text.includes("骨") || text.includes("ortho")) return "🦴";
  if (text.includes("肿瘤") || text.includes("onc")) return "💊";
  if (text.includes("神经") || text.includes("neuro")) return "🧠";
  if (text.includes("检验") || text.includes("lab")) return "🔬";
  if (text.includes("影像") || text.includes("radio")) return "🩻";
  if (text.includes("急诊") || text.includes("icu")) return "🚑";
  if (text.includes("口腔") || text.includes("oral")) return "🦷";
  if (text.includes("护理") || text.includes("nurs")) return "💉";
  return "🏥";
}

function getColor(systemName: string) {
  const key = systemColorLookup[systemName] || colorNames[Math.abs(systemName.split("").reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)) % colorNames.length];
  return colorPalette[key];
}

function monthKey(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length < 2) return null;
    const year = parts[0];
    const month = parts[1].padStart(2, "0");
    if (isNaN(parseInt(year)) || isNaN(parseInt(month))) return null;
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

function isPast(mk: string) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return mk < currentMonth;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(mk: string, delta: number): string {
  const [yStr, mStr] = mk.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function compareMonthKey(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const VIEW_WINDOW_SIZE = 6;
// f23: 一页最多展示 5 个实习生,避免字号被迫缩小;用户列表可分页
// f23 撤销:f24 用户希望保留全部实习生在甘特图中显示,通过父容器上下滚动
// (不再使用 5/页分页)
const INTERN_PAGE_SIZE = Infinity as unknown as number;

export function RotationOverviewPage() {
  const { data: rotations, isLoading, isFetching: rotationsFetching } = useAllCurrentRotation();
  // 关键修复:从"当前实习(active)"取所有实习生,而非要等 rotations 才有行 ——
  // 用户原话:"轮转总览这里应该把当前实习的所有人都应该给我展示出来。"
  const { data: activeInterns, isFetching: internsFetching } = useInterns("active");
  const { data: departments } = useDepartments(); // 用于在「类型」列里把 fixed_department_id 解析为科室名
  // 始终保留可用,pending 状态下使用 [] 即可
  const interns = activeInterns || [];
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // 业务新需求:不再跳转 /interns/:id,改为右侧 inline 面板
  const [selectedInternId, setSelectedInternId] = useState<string | null>(null);
  const [selectedInternName, setSelectedInternName] = useState<string>("");
  const ganttRef = useRef<HTMLDivElement>(null);

  // 数据中真实出现的月份键（用于参考 / 翻页边界）
  const dataMonthKeys = useMemo(() => {
    if (!rotations) return [] as string[];
    const set = new Set<string>();
    rotations.forEach((r) => {
      const mk = monthKey(r.start_date || "");
      if (mk) set.add(mk);
    });
    return Array.from(set).sort();
  }, [rotations]);

  const rotationStart = useMemo(() => {
    if (!rotations || rotations.length === 0) return null;
    return rotations.reduce<string | null>((earliest, r) => {
      if (r.start_date && (!earliest || r.start_date < earliest)) return r.start_date;
      return earliest;
    }, null);
  }, [rotations]);

  const deriveMonthKey = useCallback((r: RotationWithNames): string | null => {
    if (r.start_date) {
      const mk = monthKey(r.start_date);
      if (mk) return mk;
    }
    if (!rotationStart) return null;
    const baseParts = rotationStart.split("T")[0].split("-");
    if (baseParts.length < 2) return null;
    let year = parseInt(baseParts[0]);
    let month = parseInt(baseParts[1]);
    if (isNaN(year) || isNaN(month)) return null;
    month += (r.month_index - 1);
    while (month > 12) { month -= 12; year++; }
    while (month < 1) { month += 12; year--; }
    return `${year}-${String(month).padStart(2, "0")}`;
  }, [rotationStart]);

  // 视图窗口起始月：默认当前月；保留用户手动翻页的位置
  const earliestDataMonth = dataMonthKeys[0] || null;
  const defaultLeftMonth = useMemo(() => {
    const nowKey = currentMonthKey();
    // 若数据范围包含当前月,优先把窗口起点对齐到当前月,否则对齐到数据最早月
    if (dataMonthKeys.length === 0) return nowKey;
    if (dataMonthKeys.includes(nowKey)) return nowKey;
    if (earliestDataMonth && earliestDataMonth > nowKey) return earliestDataMonth;
    return nowKey;
  }, [dataMonthKeys, earliestDataMonth]);

  const [leftMonth, setLeftMonth] = useState<string>(defaultLeftMonth);

  // 当数据加载完后,若视图起始月仍是初始默认且左侧没有数据,把窗口拉回到数据范围
  useEffect(() => {
    if (!rotations || rotations.length === 0) return;
    // 当数据范围中存在更早月份,而当前窗口已经夹在后部时,允许左滑回到数据起点
  }, [rotations]);

  const viewMonthKeys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < VIEW_WINDOW_SIZE; i++) keys.push(shiftMonthKey(leftMonth, i));
    return keys;
  }, [leftMonth]);

  const earliestMonth = dataMonthKeys[0] || null;
  const latestMonth = dataMonthKeys[dataMonthKeys.length - 1] || null;

  // 翻页状态计算:
  //   - canGoPrev / canGoFirst: 允许往历史无限左滑,只看 window 是否还能整体往左挪(永远允许从左滑出到历史)
  //     r15 修复:不再用 earliestMonth / dataMonthKeys[0] 锁住左边界,允许查任意历史月份
  //   - canGoNext / canGoLast: 同理右侧允许无限滑动(只要 leftMonth 不超过 latestMonth + 视野)
  const canGoPrev = true;
  const canGoFirst = leftMonth !== currentMonthKey();
  const canGoNext = true;
  const canGoLast = true;

  const goPrevMonth = () => setLeftMonth((cur) => shiftMonthKey(cur, -1));
  const goNextMonth = () => setLeftMonth((cur) => shiftMonthKey(cur, 1));
  const goFirstMonth = () => {
    if (earliestMonth) {
      // 把窗口退回到最早月对齐
      setLeftMonth(earliestMonth);
    }
  };
  const goLastDataMonth = () => {
    if (latestMonth) {
      // 把窗口起点对齐到 数据最末月 - (WINDOW_SIZE - 1)
      setLeftMonth(shiftMonthKey(latestMonth, -(VIEW_WINDOW_SIZE - 1)));
    }
  };

  const isLoadingInterns = !interns && internsFetching;
  const dataReady = !isLoading && !rotationsFetching && !isLoadingInterns && rotations !== undefined && interns !== undefined;

  const internRows = useMemo(() => {
    if (!interns) return [];
    // 派生:实习生 ID → 是否含至少 1 行 confirmed
    const confirmedSet = new Set<string>();
    if (rotations) {
      for (const r of rotations) {
        if (r.status === "confirmed") confirmedSet.add(r.intern_id);
      }
    }
    // 业务规则:
    //   - 轮转型实习生(无 fixed_department_id)：必须至少有 1 条 confirmed 行；
    //     无 confirmed 行时 fallback 展示全部。
    //   - 固定科室实习生(fixed_department_id 非空)：总是展示(无需 rotation 行)。
    // 修复:固定科室实习生不再被间接过滤掉(任雨欣之类 fixed-dept 无 rotation 的也必须出现)。
    const source = interns.filter((it) => {
      if (it.fixed_department_id) return true; // 固定科室总是展示
      if (confirmedSet.has(it.id)) return true;
      // fallback:全员无 confirmed 时仍展示轮转型
      return confirmedSet.size === 0;
    });
    const rows: {
      internId: string;
      internName: string;
      className: string;
      startDate: string;
      fixedDepartmentId?: string | null;
      fixedDeptName?: string | null;
      fixedSystemName?: string | null;
      durationMonths: number;
    }[] = [];
    for (const it of source) {
      const dept = (departments || []).find((d) => d.id === it.fixed_department_id);
      rows.push({
        internId: it.id,
        internName: it.name,
        className: it.class_name || "",
        startDate: it.start_date || "",
        fixedDepartmentId: it.fixed_department_id,
        fixedDeptName: dept?.name || null,
        fixedSystemName: dept?.system_name || null,
        durationMonths: it.duration_months || 0,
      });
    }
    rows.sort((a, b) => a.internName.localeCompare(b.internName, "zh"));
    return rows;
  }, [interns, rotations, departments]);

  const filteredInternRows = useMemo(() => {
    if (!search) return internRows;
    const q = search.toLowerCase();
    return internRows.filter((row) =>
      row.internName.toLowerCase().includes(q) ||
      row.className.toLowerCase().includes(q)
    );
  }, [internRows, search]);

  /**
   * 业务规则(2026-06-30):
   * 轮转总览左侧只展示「在当前视图区间内存在任意轮转记录」的实习生。
   * 翻到未来月份(2027+)时左侧自动为空;回到过去月份也可核对已结束排班。
   * - 完全无 rotation:向后兼容显示全部 active 实习生
   * - 区间内有 1 个月任一实习生 ⇒ 显示
   * - 区间内没人 ⇒ 全员隐藏(避免无意义空行)
   */
  const inViewRangeIds = useMemo(() => {
    const present = new Set<string>();
    if (!rotations) return present;
    for (const r of rotations) {
      const mk = deriveMonthKey(r);
      if (!mk) continue;
      if (viewMonthKeys.includes(mk)) {
        present.add(r.intern_id);
      }
    }
    return present;
  }, [rotations, deriveMonthKey, viewMonthKeys]);

  // 实习总览的可见实习生集合:
  //   - 全部固定科室实习生(fixed_department_id 非空)
  //   - 轮转型实习生,且至少有一条 confirmed/completed 的 rotation(已确认分配的人)
  //   - 排除 status='pre_alloc' 的轮转未确认实习生
  const internRotationStatusMap = useMemo(() => {
    const m = new Map<string, Set<string>>(); // intern_id -> Set<status>
    for (const r of rotations || []) {
      let s = m.get(r.intern_id);
      if (!s) {
        s = new Set<string>();
        m.set(r.intern_id, s);
      }
      s.add(r.status);
    }
    return m;
  }, [rotations]);

  // 仅构造视图内含数据的月份键->轮转映射（不依赖 allMonthKeys）
  // 必须先于 visibleInternRows 定义(避免 TDZ 引用前的报错)
  const internRotationMap = useMemo(() => {
    if (!rotations) return new Map<string, Map<string, RotationWithNames>>();
    const map = new Map<string, Map<string, RotationWithNames>>();
    for (const row of internRows) {
      map.set(row.internId, new Map());
    }
    for (const r of rotations) {
      const mk = deriveMonthKey(r);
      if (!mk) continue;
      const internMap = map.get(r.intern_id);
      if (internMap) internMap.set(mk, r);
    }
    return map;
  }, [rotations, internRows, deriveMonthKey]);

  const visibleInternRows = useMemo(() => {
    if (!interns || interns.length === 0) return [] as typeof internRows;
    return filteredInternRows.filter((row) => {
      const isFixed = !!row.fixedDepartmentId;
      if (isFixed) {
        // 固定科室实习生:仅在实习时间段与当前视图窗口(viewMonthKeys)有重叠时展示
        // (修复:不再无条件全量展示,避免非本时段实习的固定科室实习生误出现)
        if (!row.startDate || !row.durationMonths) return false;
        const [vStart, vEnd] = [viewMonthKeys[0], viewMonthKeys[viewMonthKeys.length - 1]];
        if (!vStart || !vEnd) return false;
        // 实习区间 [start, start+durationMonths) 与 [vStart, vNextMonth) 是否重叠
        const s = new Date(row.startDate + "T00:00:00");
        const e = new Date(s);
        e.setMonth(e.getMonth() + row.durationMonths);
        const vS = new Date(vStart + "-01T00:00:00");
        const vE = new Date(vEnd + "-01T00:00:00");
        vE.setMonth(vE.getMonth() + 1);
        return s < vE && e > vS;
      }
      const statuses = internRotationStatusMap.get(row.internId);
      if (!statuses) return false; // 轮转型无 rotation -> 不展示
      // 至少 1 条 confirmed / completed 才展示;纯 pre_alloc 不展示
      if (!statuses.has("confirmed") && !statuses.has("completed")) return false;
      // 必须落在当前视图区间内有 rotation 行(避免「2025-09~2026-02 时段无分配」的实习生被误展示)
      const rotMap = internRotationMap.get(row.internId);
      if (!rotMap || rotMap.size === 0) return false;
      for (const mk of viewMonthKeys) {
        if (rotMap.has(mk)) return true;
      }
      return false;
    });
  }, [filteredInternRows, internRotationStatusMap, interns, internRotationMap, viewMonthKeys]);

  // f24 撤销分页,改为保留全部实习生、容器上下滚动
  const visiblePageRows = visibleInternRows;

  /**
   * 对于固定科室实习生(无 backend rotation 记录),为每个月份生成虚拟 RotationWithNames
   * — 用于甘特图月份格描绘"在固定科室"的每个月份。
   * 仅在 rotMap 中没有真实 rotation 且该实习生确实落在月份区间内时使用。
   */
  const getFixedDeptMonthlyRotation = useCallback(
    (row: typeof internRows[number], mk: string): RotationWithNames | null => {
      if (!row.fixedDepartmentId || !row.fixedDeptName) return null;
      if (!row.startDate) return null;
      // 验证 mk 落在实习生实习区间 [start, start+durationMonths - 1月] 内
      const baseStart = new Date(row.startDate + "T00:00:00");
      const [y, m] = mk.split("-");
      const mkDate = new Date(`${y}-${m}-01T00:00:00`);
      if (isNaN(mkDate.getTime()) || isNaN(baseStart.getTime())) return null;
      const endDate = new Date(baseStart);
      endDate.setMonth(baseStart.getMonth() + row.durationMonths);
      if (mkDate >= baseStart && mkDate < endDate) {
        const monthIndex =
          (mkDate.getFullYear() - baseStart.getFullYear()) * 12 +
          (mkDate.getMonth() - baseStart.getMonth()) +
          1;
        const mStart = new Date(mkDate);
        const mEnd = new Date(mStart);
        mEnd.setMonth(mStart.getMonth() + 1);
        mEnd.setDate(mEnd.getDate() - 1);
        return {
          id: `fixed-dept-${row.internId}-${mk}`,
          intern_id: row.internId,
          intern_name: row.internName,
          department_id: row.fixedDepartmentId!,
          department_name: row.fixedDeptName!,
          system_name: row.fixedSystemName || "",
          month_index: monthIndex,
          start_date: mStart.toISOString().slice(0, 10),
          end_date: mEnd.toISOString().slice(0, 10),
          status: "fixed",
        } as RotationWithNames;
      }
      return null;
    },
    []
  );

  const handleInternClick = (internId: string, internName: string) => {
    // 业务新需求:点击实习生不再 navigate,而是在右侧 inline 展示其轮转面板
    setSelectedInternId(internId);
    setSelectedInternName(internName);
  };

  const backToOverview = () => {
    setSelectedInternId(null);
    setSelectedInternName("");
  };

  const renderGantt = () => {
    const monthLabel = (mk: string) => {
      const [y, m] = mk.split("-");
      return {
        month: `${parseInt(m, 10)}月`,
        year: `${y}`,
        full: `${y}年${parseInt(m, 10)}月`,
      };
    };

    return (
      <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 完全仿轮转分配的表格外壳 — 圆润卡片 + 白底 + 边框 + shadow + 滚动区 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="overflow-y-auto flex-1 min-h-0">
            {visiblePageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-slate-300 mb-4">
                  <Inbox className="w-14 h-14 inline-block" strokeWidth={1.2} />
                </div>
                <p className="text-slate-600 text-sm font-medium">
                  当前视图区间内暂无实习生 — 可在「轮转分配」生成方案
                </p>
              </div>
            ) : (
              <table className="w-full text-base border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-teal-50/80 to-emerald-50/80 border-b border-slate-200 sticky top-0 z-10">
                    {/* 左侧命名 fixed-div 表头 — 占空姓名 + 类型上下 + 班级下的二列 */}
                    <th className="p-3.5 pl-4 pr-2 text-left text-[15px] font-extrabold text-teal-800 w-[240px] tracking-wide">
                      实习生
                    </th>
                    {viewMonthKeys.map((mk, idx) => {
                      const lbl = monthLabel(mk);
                      return (
                        <th
                          key={mk + idx}
                          className="p-3 text-center text-teal-800 min-w-[110px]"
                          title={lbl.full}
                        >
                          <span className="block text-[16px] font-extrabold tracking-tight leading-none">{lbl.month}</span>
                          <span className="block text-[13px] font-bold text-slate-600 mt-1 leading-none">{lbl.year}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visiblePageRows.map((row, idx) => {
                    const rotMap = internRotationMap.get(row.internId) || new Map<string, RotationWithNames>();
                    const isFixed = !!row.fixedDepartmentId;
                    const fixedDeptName = isFixed && row.fixedDepartmentId
                      ? (departments || []).find((d) => d.id === row.fixedDepartmentId)?.name || null
                      : null;
                    return (
                      <motion.tr
                        key={row.internId}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx, 8) * 0.03, duration: 0.3 }}
                        onClick={() => handleInternClick(row.internId, row.internName)}
                        className="border-b border-slate-200 hover:bg-teal-50/30 transition-colors duration-150 group cursor-pointer"
                      >
                        {/* 左侧:固定宽 div(总宽 240px)拆三段:左姓名(自然宽) — 中占位 flex-1 — 右轮转/固定徽章 + 班级徽章 */}
                        <td className="p-3 pl-4 pr-2 font-bold text-slate-900 text-left w-[240px]">
                          <div className="flex items-center gap-1.5 h-full min-w-0">
                            {/* 左:姓名 — 紧凑自然宽度,贴右侧徽章组,中间不留白 */}
                            <span className="text-[17px] font-extrabold text-slate-900 leading-tight px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200/90 shadow-sm whitespace-nowrap inline-flex items-center justify-center flex-shrink-0">
                              {row.internName}
                            </span>
                            {/* 占位:把右侧整组推到 td 末端,中间无空白 */}
                            <div className="flex-1 min-w-0" />
                            {/* 右:固定/轮转徽章 + 班级徽章 — 两行紧凑两列 */}
                            <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                              {isFixed ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11.5px] font-extrabold px-2 py-0.5 rounded-md border bg-emerald-100 text-emerald-800 border-emerald-300/60 whitespace-nowrap"
                                  title={fixedDeptName ? `固定在「${fixedDeptName}」` : "固定科室"}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {fixedDeptName ? `固定:${fixedDeptName}` : "固定"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11.5px] font-extrabold px-2 py-0.5 rounded-md border bg-indigo-100 text-indigo-800 border-indigo-300/60 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                  轮转
                                </span>
                              )}
                              {row.className ? (
                                <span className="text-[11.5px] text-slate-700 font-extrabold px-2 py-0.5 rounded-md bg-white border border-slate-200/80 whitespace-nowrap">
                                  {row.className}
                                </span>
                              ) : (
                                <span className="text-[11.5px] text-slate-300 px-2 py-0.5">—</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* 月份列 */}
                        {viewMonthKeys.map((mk, mIdx) => {
                          const r = rotMap.get(mk) || (isFixed ? getFixedDeptMonthlyRotation(row, mk) : null);
                          const inPast = isPast(mk);
                          if (!r) {
                            return (
                              <td
                                key={mk + mIdx}
                                className="p-2 text-center align-middle"
                              >
                                <div className="rounded-lg border border-dashed border-slate-200/60 py-2 text-slate-300 text-sm font-semibold">
                                  —
                                </div>
                              </td>
                            );
                          }
                          const color = getColor(r.system_name);
                          const lbl = monthLabel(mk);
                          const tooltip = `${lbl.full} · ${r.department_name} · ${r.system_name} · ${r.status}`;
                          return (
                            <td
                              key={mk + mIdx}
                              className={`p-2 text-center align-middle ${inPast ? "opacity-55 saturate-70" : ""}`}
                              title={tooltip}
                            >
                              {/* 科室名 — 增大字号、无背景色、纯边框描边 */}
                              <div className={`inline-block text-[16px] font-extrabold leading-tight px-2.5 py-0.5 rounded-md border bg-transparent tracking-tight whitespace-nowrap ${color.text === "text-indigo-700" ? "text-indigo-700 border-indigo-300/70" : color.text} ${color.text === "text-indigo-700" ? "border-indigo-300/70" : (color.text === "text-rose-700" ? "border-rose-300/70" : (color.text === "text-amber-700" ? "border-amber-300/70" : (color.text === "text-emerald-700" ? "border-emerald-300/70" : (color.text === "text-violet-700" ? "border-violet-300/70" : (color.text === "text-cyan-700" ? "border-cyan-300/70" : (color.text === "text-orange-700" ? "border-orange-300/70" : "border-teal-300/70"))))))}`}>
                                {r.department_name}
                              </div>
                            </td>
                          );
                        })}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  // 翻页按钮区
  const renderPager = () => {
    const firstLabel = viewMonthKeys[0]
      ? `${viewMonthKeys[0].split("-")[0]}年${parseInt(viewMonthKeys[0].split("-")[1], 10)}月`
      : "";
    const lastLabel = viewMonthKeys[viewMonthKeys.length - 1]
      ? `${viewMonthKeys[viewMonthKeys.length - 1].split("-")[0]}年${parseInt(viewMonthKeys[viewMonthKeys.length - 1].split("-")[1], 10)}月`
      : "";

    return (
      <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
        <button
          type="button"
          onClick={goFirstMonth}
          disabled={!canGoFirst}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-600 transition-all ${canGoFirst ? "bg-white hover:bg-slate-100 hover:border-amber-400 hover:text-amber-700 active:scale-95" : "bg-slate-50 text-slate-300 cursor-not-allowed"}`}
          title="跳到数据最早月份"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goPrevMonth}
          disabled={!canGoPrev}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-600 transition-all ${canGoPrev ? "bg-white hover:bg-slate-100 hover:border-amber-400 hover:text-amber-700 active:scale-95" : "bg-slate-50 text-slate-300 cursor-not-allowed"}`}
          title="向左翻一个月"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 min-w-[150px] text-center select-none">
          {firstLabel} — {lastLabel}
        </div>
        <button
          type="button"
          onClick={goNextMonth}
          disabled={!canGoNext}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-600 transition-all ${canGoNext ? "bg-white hover:bg-slate-100 hover:border-amber-400 hover:text-amber-700 active:scale-95" : "bg-slate-50 text-slate-300 cursor-not-allowed"}`}
          title="向右翻一个月"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goLastDataMonth}
          disabled={!canGoLast}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-600 transition-all ${canGoLast ? "bg-white hover:bg-slate-100 hover:border-amber-400 hover:text-amber-700 active:scale-95" : "bg-slate-50 text-slate-300 cursor-not-allowed"}`}
          title="跳到数据最末月份"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const allocStatusConfig: Record<string, { label: string; cls: string }> = {
    ready:          { label: "未分配",   cls: "bg-slate-100/95 text-slate-700 border-slate-200/60" },
    pre_allocated:  { label: "已预分配", cls: "bg-amber-100/95 text-amber-700 border-amber-200/60" },
    confirmed:      { label: "已确认",   cls: "bg-emerald-100/95 text-emerald-700 border-emerald-200/60" },
    completed:      { label: "已完成",   cls: "bg-indigo-100/95 text-indigo-700 border-indigo-200/60" },
  };

  // 当 selectedInternId 选定,渲染右侧 inline 详情面板(不跳路由,沿用现有 viewMonthKeys + internRotationMap)
  const renderInternPanel = () => {
    const row = internRows.find((r) => r.internId === selectedInternId);
    if (!row) return null;
    const rotMap = internRotationMap.get(row.internId) || new Map<string, RotationWithNames>();
    const monthLabel = (mk: string) => {
      const [y, m] = mk.split("-");
      return `${y}年${parseInt(m, 10)}月`;
    };
    const statusBadge = (s: string) => {
      if (s === "confirmed") return { label: "已确认", cls: "bg-emerald-100 text-emerald-700 border-emerald-200/60" };
      if (s === "completed") return { label: "已完成", cls: "bg-slate-100 text-slate-600 border-slate-200/60" };
      if (s === "pre_alloc") return { label: "预分配", cls: "bg-amber-100 text-amber-700 border-amber-200/60" };
      return { label: s, cls: "bg-slate-100 text-slate-600 border-slate-200/60" };
    };
    // 派生:对应的 active intern + 分配状态
    const selIntern = interns.find((i) => i.id === row.internId);
    const allocKey = (selIntern?.allocation_status as string) || "ready";
    const allocCfg = allocStatusConfig[allocKey] || allocStatusConfig.ready;
    const isFixed = !!row.fixedDepartmentId;
    // f21:面板 metric — 用全部 rotation 数据(不局限于 viewMonthKeys,体现"全部概况")
    const allRots = Array.from(rotMap.values());
    const totalRots = allRots.length;
    const confirmedCount = allRots.filter((r) => r.status === "confirmed").length;
    const completedCount = allRots.filter((r) => r.status === "completed").length;
    const preAllocCount = allRots.filter((r) => r.status === "pre_alloc").length;
    const uniqueSystems = new Set(allRots.map((r) => r.system_name)).size;
    const firstDept = (() => {
      for (const mk of viewMonthKeys) {
        const r = rotMap.get(mk);
        if (r) return r.department_name;
      }
      return "暂无安排";
    })();
    return (
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.25 }}
        className="flex-1 min-w-0 flex flex-col h-full gap-4"
      >
        {/* ==============[ 整合卡片 — 信息+metric+区间 放一个 div 框内，清爽风格 ]============== */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          {/* 返回按钮 + 名字 + 类型/状态徽章 + 班级 — 紧凑横排 */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-teal-50/80 to-emerald-50/80 border-b border-slate-200 flex items-center gap-2.5 flex-nowrap overflow-x-auto">
            <button
              type="button"
              onClick={backToOverview}
              aria-label="返回到轮转总览"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg bg-white text-teal-700 border border-teal-200 hover:bg-teal-50 transition-all duration-200 active:scale-[0.97] flex-shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
              <span>返回总览</span>
            </button>
            <h2 className="text-[18px] font-extrabold text-teal-800 tracking-tight whitespace-nowrap">{row.internName}</h2>
            {row.className && (
              <span className="text-[13px] font-bold text-slate-600 bg-white/80 border border-slate-200 px-2 py-0.5 rounded-md tracking-wide whitespace-nowrap">{row.className}</span>
            )}
            {isFixed ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300/60 whitespace-nowrap">固定</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-300/60 whitespace-nowrap">轮转</span>
            )}
            <span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-md border whitespace-nowrap ${allocCfg.cls}`}>
              {allocCfg.label}
            </span>
            <span className="text-[12px] font-medium text-slate-500 whitespace-nowrap">
              区间 {viewMonthKeys[0]} ~ {viewMonthKeys[viewMonthKeys.length - 1]}
            </span>
            <span className="text-slate-400 text-[13px] mx-1">|</span>
            <span>起始科室:<span className="text-teal-700 font-extrabold ml-1">{firstDept}</span></span>
            <span className="text-slate-400">|</span>
            <span>记录 <span className="text-teal-700 font-extrabold">{totalRots}</span> 条</span>
            <span className="text-slate-400">|</span>
            <span className={confirmedCount === totalRots && totalRots > 0 ? "text-emerald-700 font-extrabold" : ""}>
              已确认 {confirmedCount}/{totalRots}
            </span>
            <span className="text-slate-400">|</span>
            <span>涉及 <span className="text-teal-700 font-extrabold">{uniqueSystems}</span> 系统</span>
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
          {/* 表头 — 清新风格 */}
          <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/80 flex-shrink-0">
            <div className="grid grid-cols-[96px_minmax(140px,1.4fr)_minmax(110px,1fr)_minmax(100px,0.8fr)_minmax(110px,1fr)_minmax(110px,1fr)] items-center gap-2.5">
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">年月</div>
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">科室</div>
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">系统</div>
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">状态</div>
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">开始日期</div>
              <div className="text-[14px] font-extrabold text-teal-800 tracking-tight text-center">结束日期</div>
            </div>
          </div>

          {/* 身体 — 简洁白底行 */}
          <div className="flex-1 overflow-auto">
            <div className="px-3 py-2.5 space-y-2 bg-noise">
            {/* r13: 仅展示该实习生"已在 rotation 表中"的月份,不要展示未涉及的 "暂无排班" 空框
    r16: 改为平稳一列布局,完整列出 月份 / 科室 / 系统 / 状态 / 开始 / 结束 六列
    r18: 固定科室实习生(无 backend rotation 行)需要用虚拟派生行来填充每月(任雨欣之类) */}
{(() => {
  const visibleRotations: RotationWithNames[] = isFixed
    ? viewMonthKeys
        .map((mk) => getFixedDeptMonthlyRotation(row, mk))
        .filter((x): x is RotationWithNames => x !== null)
        .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")))
    : Array.from(rotMap.values())
        .slice()
        .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));
  if (visibleRotations.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="flex flex-col items-center justify-center py-12 px-6 rounded-2xl border border-dashed border-slate-300/70 bg-stone-50/50 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-3">
          <Inbox className="w-7 h-7 text-slate-400" />
        </div>
        {isFixed ? (
          <>
            <div className="text-[17px] font-extrabold text-emerald-700 mb-2">该实习生为固定科室,无需轮转分配</div>
            <div className="text-sm text-slate-500">如需查看完整科室信息,请进入「当前实习」点击卡片查看。</div>
          </>
        ) : (
          <>
            <div className="text-[17px] font-extrabold text-slate-700 mb-2">该实习生暂无轮转记录</div>
            <div className="text-sm text-slate-500">请先在「轮转分配」页点击「一键预分配」生成方案。</div>
          </>
        )}
      </motion.div>
    );
  }
  return visibleRotations.map((rotation, idx) => {
    const mk = monthKey(rotation.start_date || "") || `${rotation.month_index}`;
    const color = getColor(rotation.system_name);
    const badge = statusBadge(rotation.status);
    const monthText = (() => {
      if (mk && /-/.test(mk)) {
        const [y, m] = mk.split("-");
        return `${y}-${m}`;
      }
      return `M${rotation.month_index}`;
    })();
    return (
      <motion.div
        key={rotation.id + mk}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: idx * 0.03, duration: 0.25 }}
        className={`group grid grid-cols-[96px_minmax(140px,1.4fr)_minmax(110px,1fr)_minmax(100px,0.8fr)_minmax(110px,1fr)_minmax(110px,1fr)] items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-200 cursor-default ${mk === currentMonthKey() ? "border-amber-300/80 ring-2 ring-amber-300/40 bg-gradient-to-r from-amber-50/70 via-white to-stone-50/40 shadow-md shadow-amber-200/40" : "border-slate-200/70 bg-gradient-to-r from-white via-white to-slate-50/30 hover:border-violet-300/70 hover:shadow-md hover:shadow-violet-200/30"}`}
      >
        {/* 月份 badge — f25 缩小 h-12,字号降为 16px */}
        <div className={`min-w-[68px] h-[48px] rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${color.badge} border ${color.glow} shadow-sm`}>
          <span className="text-[10px] font-bold tracking-wider opacity-80">
            {monthText.split("-")[0]}
          </span>
          <span className={`text-[16px] font-extrabold tabular-nums leading-none mt-0.5 ${color.text.replace("-700","-800")}`}>
            {parseInt(monthText.split("-")[1] || "0", 10)}月
          </span>
        </div>
        {/* 科室 — text-center 对齐表头 */}
        <div className="min-w-0 text-center">
          <div className={`text-[14px] font-extrabold truncate tracking-tight ${color.text}`}>{rotation.department_name}</div>
        </div>
        {/* 系统 — f25 缩小 + 居中 */}
        <div className={`min-w-0 text-[12.5px] font-bold text-center truncate ${color.text}`}>
          {rotation.system_name}
        </div>
        {/* 状态 — f25 缩小 */}
        <div className="min-w-0 flex justify-center">
          <span className={`inline-flex items-center text-[12px] font-extrabold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {/* 开始日期 */}
        <div className="text-[13px] text-slate-700 font-bold tabular-nums truncate text-center">
          {rotation.start_date ? formatDate(rotation.start_date) : "—"}
        </div>
        {/* 结束日期 */}
        <div className="text-[13px] text-slate-700 font-bold tabular-nums truncate text-center">
          {rotation.end_date ? formatDate(rotation.end_date) : "—"}
        </div>
      </motion.div>
    );
  });
})()}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
    >

      <div className="flex gap-6 flex-1 min-h-0">
        {/* 甘特图主区 */}
        <div className="flex-1 min-w-0 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[15px] font-extrabold tracking-tight bg-gradient-to-r from-slate-800 via-slate-700 to-amber-700 bg-clip-text text-transparent">
                实习总览
              </h2>
              {/* 实习总览语义:展示「固定科室 + 已确认轮转」的实习生(不含未分配 / 未确认的) */}
              <span className="text-[15px] font-bold text-slate-700 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200/70">
                已确认 {visibleInternRows.length} 人
              </span>
              {viewMonthKeys.length > 0 && (
                <span className="text-[15px] font-bold text-slate-700 bg-violet-100 px-2.5 py-1 rounded-md border border-violet-200/70">
                  显示 {viewMonthKeys[0]} ~ {viewMonthKeys[viewMonthKeys.length - 1]}
                </span>
              )}
              {/* (顶部红色「该区间无实习生」提示与下方居中提示重复,已删除) */}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  placeholder="搜索实习生..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm w-56 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-300 transition-all placeholder:text-slate-400"
                />
              </div>
              {renderPager()}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <AnimatePresence mode="wait">
              {!dataReady ? (
                <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
                  <div className="w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" />
                </div>
              ) : internRows.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 bg-gradient-to-br from-slate-50 via-white to-amber-50/40 rounded-2xl border border-slate-200 shadow-sm"
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 flex items-center justify-center mb-4 shadow-inner">
                    <Inbox className="w-9 h-9 text-slate-400" />
                  </div>
                  <p className="text-slate-700 text-base font-semibold mb-1">暂无活跃实习生</p>
                  <p className="text-slate-500 text-sm mb-5">请先在「当前实习」录入后再回到此处查看实习总览</p>
                  <button
                    onClick={() => navigate("/")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-600/20 active:scale-[0.97] whitespace-nowrap flex-shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>前往「当前实习」</span>
                  </button>
                </motion.div>
              ) : !rotations || rotations.length === 0 ? (
                <div className="space-y-3 h-full flex flex-col">
                  <div className="bg-gradient-to-r from-amber-50 to-amber-50/70 border border-amber-200/60 text-amber-800 px-4 py-3 rounded-xl text-sm flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span aria-hidden>⚠️</span>
                      <span className="font-medium">暂无轮转数据,请先为 {internRows.length} 名活跃实习生排班。</span>
                    </div>
                    <button
                      onClick={() => navigate("/rotation")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-600/20 active:scale-[0.97] whitespace-nowrap flex-shrink-0"
                    >
                      <span>转去轮转分配</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">{selectedInternId !== null ? renderInternPanel() : renderGantt()}</div>
                </div>
              ) : selectedInternId !== null ? (
                renderInternPanel()
              ) : (
                renderGantt()
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
