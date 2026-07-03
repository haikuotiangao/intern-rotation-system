import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ShieldCheck, ChevronDown, Users, Shuffle, MousePointerSquare, Plus, Loader2, RotateCcw } from "lucide-react";import { useAllCurrentRotation, usePreAllocate, useConfirmAllocation, useResetAllocation, useManualAdjust, useAllocateForOneIntern } from "../hooks/useRotation";
import { useDepartments } from "../hooks/useDepartments";
import { useInterns } from "../hooks/useInterns";
import { Modal } from "../components/ui/Modal";
import { Intern, RotationWithNames } from "../types";
import { getSystemColor, formatDate } from "../lib/utils";

const allocIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
const checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const resetIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
const adjustIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

const getCalendarMonth = (startDate: string, offsetMonths: number): string => {
  const d = new Date(startDate + "T00:00:00");
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
};

// 单实习生预分配 Modal:按 start_date + duration_months 推算每个月份(0-based offset)
const getMonthKey = (startDate: string, offsetMonths: number): string => {
  const d = new Date(startDate + "T00:00:00");
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// 分配状态徽章配色 (与 docs/CurrentInterns 保持一致)
const allocStatusConfig: Record<string, { label: string; className: string }> = {
  ready:          { label: "未分配",   className: "bg-slate-100 text-slate-700 border border-slate-200/60" },
  pre_allocated:  { label: "已预分配", className: "bg-amber-100 text-amber-700 border border-amber-200/60" },
  confirmed:      { label: "已确认",   className: "bg-emerald-100 text-emerald-700 border border-emerald-200/60" },
  completed:      { label: "已完成",   className: "bg-indigo-100 text-indigo-700 border border-indigo-200/60" },
};

// 全屏 Loading 装饰 — 主页面 wrapper 数据未到齐时显示,避免闪烁空状态
// 单 ring + 一个图标,清晰表明加载中,避免双环叠层导致视觉错位
function FullPageSpinner({ label = "数据加载中" }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 bg-white/85 backdrop-blur-sm flex items-center justify-center"
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.05, ease: "linear" }}
          className="relative flex items-center justify-center"
        >
          <div className="w-14 h-14 rounded-full border-[4px] border-teal-200/70 border-t-teal-600" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-sm font-semibold text-slate-700 tracking-wide">{label}</span>
          <span className="text-[11px] text-slate-400">请稍候,正在为您准备数据…</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function RotationAllocationPage() {
  const rotationQuery = useAllCurrentRotation();
  const { data: rotations, isLoading } = rotationQuery;
  const { data: departments } = useDepartments();
  // 实习类型标识(轮转 / 固定科室)—— 后续在矩阵行渲染中使用
  const { data: activeInterns } = useInterns("active");
  const preAllocate = usePreAllocate();
  const confirmAlloc = useConfirmAllocation();
  const resetAlloc = useResetAllocation();
  const manualAdjust = useManualAdjust();
  const allocateForOne = useAllocateForOneIntern();
  const qc = useQueryClient();
  const operator = "管理员";

  const [error, setError] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<RotationWithNames | null>(null);
  const [adjustDeptId, setAdjustDeptId] = useState("");
  const [adjustSystem, setAdjustSystem] = useState("");
  const [showRulesExpander, setShowRulesExpander] = useState(false);

  // 单实习生预分配 Modal (用于"未分配"实习生手动指定 系统+科室+月份)
  // 打开时传入目标 intern。Modal 内部根据 intern.start_date + duration_months 推出月份数。
  const [singleAllocIntern, setSingleAllocIntern] = useState<Intern | null>(null);
  const [singleAllocMonths, setSingleAllocMonths] = useState<
    { systemId: string; departmentId: string }[]
  >([]);

  const maxMonth = Math.max(...(rotations || []).map((r) => r.month_index), 0);
  const rotationStart = (rotations || []).reduce((earliest, r) =>
    r.start_date && (!earliest || r.start_date < earliest) ? r.start_date : earliest
  , undefined as string | undefined) ?? undefined;

  // ============================================================
  // 业务规则(r-new):
  //  - ready 实习生(尚未生成任何 rotation 行,但 intern.allocation_status='ready')
  //    必须出现在矩阵中,新建"未分配" + 行内操作列「预分配此实习生」入口
  //  - 一旦实习生任一月份已被 confirmed/completed,整行从矩阵中剔除
  //  - 仅 status === 'pre_alloc' 的 rotation 行落在矩阵的月份列上
  // ============================================================
  const allInternIds = [...new Set((rotations || []).map((r) => r.intern_id))];

  // 1) 完全已确认
  const fullyConfirmedInternIds = new Set(
    allInternIds.filter((id) => {
      const rs = (rotations || []).filter((r) => r.intern_id === id);
      return rs.length > 0 && rs.every((r) => r.status === "confirmed");
    })
  );
  const hasAnyFullyConfirmed = fullyConfirmedInternIds.size > 0;

  // 2) 任何存在 confirmed 或 completed 月份的实习生(整行剔除,只给徽章提示)
  const internIdsWithAnyConfirmed = new Set(
    allInternIds.filter((id) =>
      (rotations || []).some((r) =>
        r.intern_id === id && (r.status === "confirmed" || r.status === "completed")
      )
    )
  );

  // 2.5) r-f22:intern.id → fixed_department_id 映射。
  //      必须在 readyInternIds / visibleInternIds 之前定义,因这两层防御都用到。
  //       (后端的 update_intern 已经联动清理 rotation_assignments,
  //        此处仅作 UI 渲染前的兜底,防止后端 + 前端缓存出现 race 时的脏数据。)
  const internFixedMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of activeInterns || []) {
      const fid = it.fixed_department_id;
      if (fid && fid.length > 0) m.set(it.id, fid);
    }
    return m;
  }, [activeInterns]);

  // 3) ready 实习生 ID 集合 (allocation_status='ready' 或后端缺失默认 ready)
  //    同时剔除固定科室实习生 — 她们不参与轮转分配矩阵。
  const readyInternIds = new Set(
    (activeInterns || [])
      .filter((i) => {
        // 固定科室实习生 → 不入轮转分配矩阵,前端兜底过滤
        if (i.fixed_department_id && i.fixed_department_id.length > 0) return false;
        return (i.allocation_status || "ready") === "ready";
      })
      .map((i) => i.id)
  );

  // 4) 矩阵展示的实习生 ID =
  //    A) 出现在 rotation 表中 & 没有任一 confirmed & 至少一条 pre_alloc(原逻辑)
  //    B) ready 实习生(active + 没有任一 confirmed/completed)
  //    二者并集,且两者都剔除"任何 confirmed/completed 的实习生"(避免与 confirmed 视图重复)
  //    同时剔除固定科室实习生(她们不参与轮转分配)。
  const visibleInternIds = new Set<string>();
  // A) 原逻辑
  for (const id of allInternIds) {
    if (internIdsWithAnyConfirmed.has(id)) continue;
    // ★ 固定科室实习生 → 不出现在轮转分配矩阵(她被固定到某科室,不需要走轮转)
    if (internFixedMap.has(id)) continue;
    if ((rotations || []).some((r) => r.intern_id === id && r.status === "pre_alloc")) {
      visibleInternIds.add(id);
    }
  }
  // B) ready 实习生,且与 confirmed 视图不重叠(readyInternIds 已过滤 fixed)
  for (const id of readyInternIds) {
    if (internIdsWithAnyConfirmed.has(id)) continue;
    visibleInternIds.add(id);
  }

  // 4) 矩阵中真正展示的行:仅 status === 'pre_alloc' 且属于 visibleInternIds
  const unassignedRotations = (rotations || []).filter(
    (r) => r.status === "pre_alloc" && visibleInternIds.has(r.intern_id)
  );

  // 已 confirmed 但不是"全员确认" 的实习生,仍走顶部提示(允许存在)
  const internIds = Array.from(visibleInternIds);
  // 合并两源:
  //   - 来自 rotation 表的 pre_alloc 行(已有分配)
  //   - 来自 active interns 的 ready 实习生(还没分配过任何月份)
  // 用 Map 去重,并以 active interns 列表的顺序为准(更直观反映用户看到的"实习生列表")
  const internNamesMap = new Map<string, string>();
  for (const r of unassignedRotations) {
    if (!internNamesMap.has(r.intern_id)) internNamesMap.set(r.intern_id, r.intern_name);
  }
  for (const it of activeInterns || []) {
    if (!visibleInternIds.has(it.id)) continue;
    if (!internNamesMap.has(it.id)) internNamesMap.set(it.id, it.name);
  }
  // 用 active interns 顺序排序后输出
  const orderedIds = (activeInterns || []).map((i) => i.id);
  const internNames: [string, string][] = orderedIds
    .filter((id) => internNamesMap.has(id))
    .map((id) => [id, internNamesMap.get(id)!]);
  const hasPreAlloc = unassignedRotations.some((r) => r.status === "pre_alloc");
  // 仅当「数据库里存在一条 confirmed OR completed」就显示顶部"已确认"徽章
  const hasConfirmed = (rotations || []).some((r) => r.status === "confirmed" || r.status === "completed");

  // 构建"已剔除实习生"明细面板已移除(r13:面板冗余、字号不均,改为下方空状态文案兜底)
  // r10: 避免每次进入页都强制 refetch — 现在 useAllCurrentRotation 已开启 30s staleTime + 不在焦点切回时重拉,
  //      stale 时由 invalidate 触发,避免额外请求

  // r9: 每位"可见实习生"的确认状态汇总 — 在矩阵每行显示其 confirmed/total 比
  // visibleInternIds 是当前要渲染的实习生集合;这些不会被整行剔除,只展示 pre_alloc 的行
  // 但用户仍需要看到"这位实习生的整月一共 confirmed 了几条 / 一共几条"以便感觉自己没漏

  const internStatuses = useMemo(() => {
    const m = new Map<string, { confirmedCount: number; totalCount: number }>();
    for (const id of internIds) {
      const rs = (rotations || []).filter((r) => r.intern_id === id);
      const confirmedCount = rs.filter((r) => r.status === "confirmed").length;
      const totalCount = rs.length;
      m.set(id, { confirmedCount, totalCount });
    }
    return m;
  }, [internIds, rotations]);

  // 5) "全部已确认"判定 — f20 修复:不能只看已经存在的 rotation 行。
  //    业务场景:48 名实习生已 confirmed 后,新增 1 名 ready 实习生(无任何 rotation 行)。
  //    旧定义: (rotations || []).length > 0 && every(r.status === "confirmed")
  //      → 全部 confirmed true → 一键预分配按钮永远 disabled,无法给新增的实习生排班。
  //    新定义:同时要求 "未覆盖的 ready 实习生" = 0 才算全确认,否则允许一键预分配。
  //    (readyInternIds 在 L136-140 已经派生,直接复用)
  const hasPendingReadyIntern = (() => {
    for (const id of readyInternIds) {
      if (!internIdsWithAnyConfirmed.has(id)) return true;
    }
    return false;
  })();
  const allRowsAreConfirmed =
    (rotations || []).length > 0 &&
    (rotations || []).every((r) => r.status === "confirmed") &&
    !hasPendingReadyIntern;

  const handlePreAllocate = () => {
    setError("");
    // 如果没有实习生可以分配,直接提示退出,不让用户走空流程
    if (!activeInterns || activeInterns.length === 0) {
      toast("暂无实习生需要进行轮转分配", { icon: "ℹ️" });
      return;
    }
    // r15: 如果「所有实习生都已确认」,不再走预分配,直接告之无需操作
    if (allRowsAreConfirmed) {
      toast("所有实习生均已确认分配，无需预分配", { icon: "ℹ️" });
      return;
    }
    // 如果有可重置的预分配记录(未确认且实习未开始),允许一键重置再分配
    if (canReset) {
      if (confirm("已存在预分配方案，是否「重置」未确认部分并重新分配?(已确认/已开始的轮转保留不动)")) {
        resetAlloc.mutate({ operator }, {
          onSuccess: () => {
            toast.success("已重置未确认的预分配,正在重新预分配...");
            // 重置完再走一次完整预分配,让所有可参与实习生拿到最新方案
            preAllocate.mutate(undefined, {
              onSuccess: (data: any) => {
                const records = Array.isArray(data) ? data : [];
                const interns = [...new Set(records.map((r: any) => r.intern_id))];
                if (records.length === 0) {
                  toast("当前没有需要预分配的实习生", { icon: "ℹ️" });
                } else {
                  // f21: 文案改为简明"本次新增"汇报,不掺杂全局总数
                  toast.success(`已为 ${interns.length} 名新实习生新增 ${records.length} 条预分配记录`);
                }
                setError("");
                qc.invalidateQueries({ queryKey: ["rotation-current"] });
                qc.refetchQueries({ queryKey: ["rotation-current"] });
              },
              onError: (e: any) => toast.error("预分配失败:" + (e?.message || "未知错误")),
            });
          },
          onError: (e: any) => toast.error("重置失败:" + (e?.message || "未知错误")),
        });
      } else {
        toast("已存在预分配方案，请点击「重置」后再重新分配", { icon: "⚠️" });
      }
      return;
    }
    preAllocate.mutate(undefined, {
      onSuccess: (data: any) => {
        const records = Array.isArray(data) ? data : [];
        const interns = [...new Set(records.map((r: any) => r.intern_id))];
        if (records.length === 0) {
          toast("当前没有需要预分配的实习生", { icon: "ℹ️" });
        } else {
          // f21: 文案改为简明"本次新增"汇报
          toast.success(`已为 ${interns.length} 名新实习生新增 ${records.length} 条预分配记录`);
        }
        setError("");
        // 强制刷新两次,确保覆盖任何缓存竞争
        qc.invalidateQueries({ queryKey: ["rotation-current"] });
        qc.refetchQueries({ queryKey: ["rotation-current"] });
      },
      onError: (e: any) => {
        const msg = e.message || "";
        if (msg.includes("UNIQUE") || msg.includes("constraint")) {
          setError("该实习生已有轮转记录，无需重复分配");
        } else {
          setError(msg || "预分配失败");
        }
        toast.error(msg || "预分配失败");
      },
    });
  };

  const handleConfirm = () => {
    if (confirm("确认分配后方案将被锁定，确定继续？")) {
      confirmAlloc.mutate({ operator }, {
        onSuccess: () => toast.success("确认分配成功！已确认实习生的分配方案已锁定"),
        onError: (e: any) => toast.error("确认分配失败：" + (e?.message || "未知错误")),
      });
    }
  };

  const handleReset = () => {
    // r14: 「重置」= 仅清空「未确认 且 实习未开始」的预分配,已 confirmed/已开始档案保留
    if (confirm("确定清空「未确认 且 实习未开始」的预分配吗?(已确认或已开始的轮转会保留不动)")) {
      resetAlloc.mutate({ operator }, {
        onSuccess: () => {
          // f20b: 用户要求文案精简,只显示「重置完成」,不再显示「共 X 条」之类的统计
          toast.success("重置完成");
        },
        onError: (e: any) => toast.error("重置失败:" + (e?.message || "未知错误")),
      });
    }
  };

  // 单实习生预分配 Modal (用于 ready 实习生手动指定科室):
  //   - 打开时按 intern.start_date + duration_months 推算 N 行月份
  //   - 每行默认值: 若 intern.fixed_department_id 则用固定科室,否则空
  //   - 系统改变会清空该行科室
  const openSingleAlloc = (intern: Intern) => {
    const months: { systemId: string; departmentId: string }[] = [];
    const startDate = intern.start_date || new Date().toISOString().slice(0, 10);
    const totalMonths = Math.max(1, intern.duration_months || 6);
    const fixedDept = intern.fixed_department_id || "";
    // 查固定科室所属系统
    let fixedSystemId = "";
    if (fixedDept) {
      const fd = (departments || []).find((d) => d.id === fixedDept);
      fixedSystemId = fd?.system_id || "";
    }
    for (let i = 0; i < totalMonths; i++) {
      months.push({ systemId: fixedSystemId, departmentId: fixedDept });
    }
    setSingleAllocIntern(intern);
    setSingleAllocMonths(months);
  };

  const closeSingleAlloc = () => {
    setSingleAllocIntern(null);
    setSingleAllocMonths([]);
  };

  // 单实习生预分配:每提交一次后端会按 (intern_id, month_index) upsert;
  // 同一记录的 status 若不是 pre_alloc(已 confirmed/completed)则拒绝,前端校验给出提示。
  const submitSingleAlloc = () => {
    if (!singleAllocIntern) return;
    // 用户必须为每一行选一个科室
    if (singleAllocMonths.some((m) => !m.departmentId)) {
      toast.error("请为每一个月份选择目标科室");
      return;
    }
    // 由单实习生 push 进来的 unique idx 推 month_index(1-based):
    //   同一实习生同 month_index 重复检查天然唯一(因为 idx 本身唯一)
    const alloc = singleAllocMonths.map((m, idx) => ({
      department_id: m.departmentId,
      month_index: idx + 1,
    }));
    allocateForOne.mutate(
      { internId: singleAllocIntern.id, allocations: alloc, operator },
      {
        onSuccess: (data: any) => {
          const count = Array.isArray(data) ? data.length : alloc.length;
          toast.success(`已为「${singleAllocIntern.name}」预分配 ${count} 个月份`);
          qc.invalidateQueries({ queryKey: ["rotation-current"] });
          qc.invalidateQueries({ queryKey: ["interns"] });
          closeSingleAlloc();
        },
        onError: (e: any) => toast.error("预分配失败:" + (e?.message || "未知错误")),
      }
    );
  };

  const openAdjust = (assignment: RotationWithNames) => {
    setAdjustTarget(assignment);
    setAdjustDeptId(assignment.department_id);
    setAdjustSystem(assignment.system_name);
  };

  const doAdjust = () => {
    if (!adjustTarget || adjustDeptId === adjustTarget.department_id) {
      setAdjustTarget(null);
      return;
    }
    manualAdjust.mutate({ assignmentId: adjustTarget.id, newDepartmentId: adjustDeptId, operator });
    setAdjustTarget(null);
  };

  const deptOptions = (departments || []).filter((d) => {
    if (!adjustSystem) return true;
    return d.system_name === adjustSystem;
  });

  const systemOptions = [...new Set((departments || []).map((d) => d.system_name))];

  // r10: per-intern 月份 → RotationWithNames 映射(按 start_date 计算月份键,避免
  // global rotationStart 与 intern 起月错位导致空白—)
  const internRotationMap = useMemo(() => {
    const m = new Map<string, Map<string, RotationWithNames>>();
    for (const [id, _] of internNames) m.set(id, new Map());
    const baseStart = rotationStart ? new Date(rotationStart + "T00:00:00") : null;
    for (const r of unassignedRotations) {
      if (!r.start_date) continue;
      // 每行的 start_date(自然月 YYYY-MM-DD)就是其列
      const cellKey = r.start_date.slice(0, 7); // "YYYY-MM"
      const internMap = m.get(r.intern_id);
      if (internMap && !internMap.has(cellKey)) internMap.set(cellKey, r);
    }
    return m;
  }, [internNames, unassignedRotations, rotationStart]);

  // 全局列(从所有出现过的 start_date 中取键,排除重复 + 异常日期)
  // 异常日期过滤:实习生日不应 < 2000 年 也不应 > 2100 年(避免 1897/2395 之类脏数据)
  const columnKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of unassignedRotations) {
      if (!r.start_date) continue;
      const ymd = r.start_date.slice(0, 7);
      const year = parseInt(ymd.slice(0, 4), 10);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) continue;
      set.add(ymd);
    }
    return Array.from(set).sort();
  }, [unassignedRotations]);

  // (internFixedMap 已上移至 readyInternIds 之前 — 见 L135-145 行)

  // id → Intern 映射(渲染 ready 实习生的「预分配此实习生」按钮时使用)
  const internByIdMap = useMemo(() => {
    const m = new Map<string, Intern>();
    for (const it of activeInterns || []) m.set(it.id, it);
    return m;
  }, [activeInterns]);

  // r14: 「重置再分配」的保护门槛
  //  - 已 confirmed 的轮转记录不允许重置(已锁定,只能去详情页手动调整科室)
  //  - 已开始实习(start_date < 今天)的轮转记录不允许重置避免破坏档案
  //  - 只有「未确认 且 实习未开始」这部分轮转可参与重置
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resettableRotations = useMemo(() => {
    return (rotations || []).filter((r) => {
      if (r.status !== "pre_alloc") return false;
      if (!r.start_date) return true;
      return new Date(r.start_date + "T00:00:00") >= today;
    });
  }, [rotations]);
  const canReset = resettableRotations.length > 0;

  // 派生 isFixed / 科室名 — 矩阵行渲染中用到
  const getFixedDeptName = (id: string): string | null => {
    const fid = internFixedMap.get(id);
    if (!fid) return null;
    return (departments || []).find((d) => d.id === fid)?.name || null;
  };

  const getRotation = (internId: string, month: number) => {
    // 月份索引 → YYYY-MM 字符串
    const colKey = columnKeys[month - 1];
    if (!colKey) return undefined;
    return internRotationMap.get(internId)?.get(colKey);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full relative"
    >
      <AnimatePresence>
        {rotationQuery.isPending && <FullPageSpinner key="alloc-fps" />}
      </AnimatePresence>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6 flex-shrink-0">
        {/* 左:标题 + 信息徽章(顶部信息)— 与右侧三个按钮字号统一为 text-[15px] */}
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight whitespace-nowrap">轮转分配</h2>
          <span className="text-[15px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/70 whitespace-nowrap">
            {internIds.length} 名待分配实习生
            {fullyConfirmedInternIds.size > 0 && ` (已确认 ${fullyConfirmedInternIds.size} 名)`}
            {columnKeys.length > 0 && ` | ${columnKeys[0]} ~ ${columnKeys[columnKeys.length - 1]}`}
          </span>
          {/* f22:「已确认」徽章与上面 "(已确认 X 名)" 重复,删除避免视觉冗余 */}
        </div>
        {/* 右:三个按钮 — 等宽,高度与左侧徽章同高 (py-2 + text-[14px]) */}
        <div className="flex gap-2 w-full lg:flex-1 lg:max-w-[520px] lg:ml-auto items-stretch">
          {/* 主操作: 一键预分配 teal→emerald */}
          <button
            onClick={handlePreAllocate}
            disabled={preAllocate.isPending || resetAlloc.isPending || allRowsAreConfirmed}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[14px] font-semibold bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl hover:from-teal-700 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-teal-600/20 hover:shadow-lg hover:shadow-teal-600/25 active:scale-[0.97] whitespace-nowrap"
          >
            {preAllocate.isPending || resetAlloc.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>正在分配…</span>
              </>
            ) : (
              <>
                <Shuffle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>一键预分配</span>
              </>
            )}
          </button>
          {/* 从主操作: 确认分配 sky→blue */}
          <button
            onClick={handleConfirm}
            disabled={confirmAlloc.isPending || allRowsAreConfirmed || (rotations || []).length === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[14px] font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl hover:from-sky-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-sky-500/20 hover:shadow-lg hover:shadow-sky-500/25 active:scale-[0.97] whitespace-nowrap"
          >
            {confirmAlloc.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>确认中…</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>确认分配</span>
              </>
            )}
          </button>
          {/* 危险次要: 重置 白底 + amber 描边 */}
          <button
            onClick={handleReset}
            disabled={resetAlloc.isPending || !canReset}
            title="仅清空「未确认 且 实习未开始」的预分配。已确认/已开始的轮转不会被重置。"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[14px] font-semibold border border-amber-300/70 bg-white text-amber-700 rounded-xl hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.97] whitespace-nowrap"
          >
            {resetAlloc.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>重置中…</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
                <span>重置</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="bg-red-50 border border-red-200/60 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 flex items-center gap-2 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
        </motion.div>
      )}

      {/* r13: 业务规则说明 — 可伸缩,默认收起避免占用首屏空间 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 text-[13.5px] text-slate-700 bg-gradient-to-br from-sky-50/90 to-indigo-50/70 border border-sky-200/60 rounded-xl flex-shrink-0 shadow-sm shadow-sky-200/40 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setShowRulesExpander((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-sky-50/60 transition-colors"
        >
          <div className="font-bold text-sky-900 text-[15px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>轮转分配规则 · 自动按这个逻辑运行</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              {showRulesExpander ? "点击收起" : "点击展开"}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-sky-700 transition-transform duration-200 ${showRulesExpander ? "rotate-180" : ""}`}
            />
          </div>
        </button>
        <AnimatePresence initial={false}>
          {showRulesExpander && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-sky-200/60"
            >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-5 pb-4 pt-3">
          {/* 卡 1: 适用对象 */}
          <div className="bg-white/80 backdrop-blur-sm border border-sky-200/60 rounded-lg px-3.5 py-3 shadow-sm shadow-sky-200/20 hover:shadow-md hover:shadow-sky-200/30 transition-shadow flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0 border border-sky-200/60">
                <Users className="w-4 h-4" />
              </div>
              <div className="font-bold text-slate-900 text-[13.5px] tracking-tight">1 · 适用对象</div>
            </div>
            <p className="text-[12.5px] text-slate-700 leading-relaxed flex-1">
              系统按实习开始日期自动顺排所有月份至结束,仅展示未确认分配的实习生。
            </p>
          </div>
          {/* 卡 2: 排班规则 */}
          <div className="bg-white/80 backdrop-blur-sm border border-sky-200/60 rounded-lg px-3.5 py-3 shadow-sm shadow-sky-200/20 hover:shadow-md hover:shadow-sky-200/30 transition-shadow flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-200/60">
                <Shuffle className="w-4 h-4" />
              </div>
              <div className="font-bold text-slate-900 text-[13.5px] tracking-tight">2 · 排班规则</div>
            </div>
            <p className="text-[12.5px] text-slate-700 leading-relaxed flex-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-bold border border-indigo-200/60">轮转型</span>
              在不同系统科室间交替,自动规避已去科室,相邻月份不同科;
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold border border-emerald-200/60 ml-1">固定型</span>
              则常驻该科室。
            </p>
          </div>
          {/* 卡 3: 操作指引 */}
          <div className="bg-white/80 backdrop-blur-sm border border-sky-200/60 rounded-lg px-3.5 py-3 shadow-sm shadow-sky-200/20 hover:shadow-md hover:shadow-sky-200/30 transition-shadow flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 border border-amber-200/60">
                <MousePointerSquare className="w-4 h-4" />
              </div>
              <div className="font-bold text-slate-900 text-[13.5px] tracking-tight">3 · 操作指引</div>
            </div>
            <p className="text-[12.5px] text-slate-700 leading-relaxed flex-1">
              <kbd className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold">一键预分配</kbd>生成方案;
              <kbd className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold ml-1">确认分配</kbd>锁定该实习生;
              <kbd className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-bold ml-1">重置</kbd>清空全部分配。
            </p>
          </div>
        </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="flex-1 min-h-0 mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="relative">
              <div className="w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          </div>
        ) : internNames.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="text-slate-300 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" className="inline-block"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </div>
            <p className="text-slate-600 text-sm font-medium">
              {allRowsAreConfirmed && readyInternIds.size === 0
                ? "所有实习生均已确认分配，无需继续分配"
                : "暂无轮转数据，请先点击「一键预分配」生成方案"}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full"
          >
            <div className="overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-gradient-to-r from-teal-50/80 to-emerald-50/80 border-b border-slate-200 sticky top-0 z-10">
                    <th className="p-3.5 pl-5 text-left text-[15px] font-extrabold text-teal-800 min-w-[200px] tracking-wide">实习生 / 状态</th>
                    {columnKeys.map((colKey, i) => {
                      const [y, m] = colKey.split("-");
                      return (
                        <th key={colKey} className="p-3 text-center text-teal-800 min-w-[110px]">
                          <span className="block text-[16px] font-extrabold tracking-tight leading-none">{parseInt(m, 10)}月</span>
                          <span className="block text-[13px] font-bold text-slate-600 mt-1 leading-none">{y}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {internNames.map(([id, name], idx) => {
                    const internRecord = internByIdMap.get(id);
                    const allocStatus = internRecord?.allocation_status || "ready";
                    const isReady = allocStatus === "ready";
                    return (
                    <motion.tr
                      key={id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.3 }}
                      className="border-b border-slate-200 hover:bg-teal-50/30 transition-colors duration-150 group"
                    >
                      <td className={`p-3.5 pl-5 font-bold text-slate-900 ${isReady ? "bg-slate-50/60" : ""}`}>
                        {/* 中对齐:姓名(加大会字号 + 框) + 轮转/固定 徽章 + 分配状态徽章 — 左右水平中轴排列 */}
                        <div className="flex items-center gap-3 min-w-0 flex-nowrap">
                          {/* 姓名(加大字号+框) */}
                          <span className="text-[18px] font-extrabold text-slate-900 leading-tight px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200/90 shadow-sm">
                            {name}
                          </span>
                          {/* 轮转/固定 徽章 */}
                          {(() => {
                            const fixedName = getFixedDeptName(id);
                            if (fixedName) {
                              return (
                                <span
                                  className="inline-flex items-center text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200/60 tracking-wide"
                                  title={`固定科室: ${fixedName}`}
                                >
                                  固定
                                </span>
                              );
                            }
                            return (
                              <span
                                className="inline-flex items-center text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200/60 tracking-wide"
                                title="轮转型实习生"
                              >
                                轮转
                              </span>
                            );
                          })()}
                          {/* 分配状态徽章 */}
                          {(() => {
                            const cfg = allocStatusConfig[allocStatus];
                            const label = cfg?.label || "未知";
                            const cls = cfg?.className || "bg-gray-100 text-gray-600 border border-gray-200/60";
                            return (
                              <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md border ${cls}`}>
                                {label}
                              </span>
                            );
                          })()}
                          {/* 部分确认信息(若有) — 与状态同行右对齐 */}
                          {!isReady && (() => {
                            const st = internStatuses.get(id);
                            if (!st) return null;
                            if (st.confirmedCount > 0) {
                              return (
                                <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60">
                                  部分确认 {st.confirmedCount}/{st.totalCount}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      {columnKeys.map((colKey) => {
                        const r = getRotation(id, columnKeys.indexOf(colKey) + 1);
                        const color = r ? getSystemColor(r.system_name) : null;
                        return (
                          <td key={colKey}
                            className={`p-2.5 text-center text-sm ${r ? "" : ""}`}
                            onClick={() => r && !hasConfirmed && openAdjust(r)}
                            style={{ cursor: r && !hasConfirmed ? "pointer" : "default" }}>
                            {r ? (
                              <motion.div
                                whileHover={!hasConfirmed ? { scale: 1.02 } : undefined}
                                className="relative group/rot px-1.5 py-1.5 rounded-lg border border-slate-200 transition-all duration-200 hover:border-teal-300/50 hover:shadow-sm"
                              >
                                <div className={`font-bold ${color!.text}`}>{r.department_name}</div>
                                <div className={`opacity-70 text-xs font-semibold ${color!.text}`}>{r.system_name}</div>
                                {!hasConfirmed && (
                                  <div className="absolute -top-1.5 -right-1.5 opacity-0 group-hover/rot:opacity-100 transition-all duration-200 bg-white rounded-full p-0.5 shadow-sm border border-slate-300"
                                    dangerouslySetInnerHTML={{ __html: adjustIcon }} />
                                )}
                              </motion.div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* f22: 底部"已确认 X 名实习生的分配"提示条多余信息,删除 */}
      {false && hasAnyFullyConfirmed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 text-sm text-amber-800 flex items-center gap-2 bg-amber-50/80 border border-amber-200/60 px-4 py-3 rounded-xl flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="text-amber-500 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span className="font-medium">已确认 {fullyConfirmedInternIds.size} 名实习生的分配。如需修改请前往「当前实习生」页面。</span>
        </motion.div>
      )}

      <Modal open={!!adjustTarget} title={`调整轮转 - ${adjustTarget?.intern_name || ""}`} onClose={() => setAdjustTarget(null)}>
        {adjustTarget && (
          <div className="space-y-4">
            <div className="bg-teal-50/50 border border-teal-100/60 rounded-xl px-4 py-3">
              <p className="text-sm text-slate-700">
                实习生 <span className="font-bold text-slate-900">{adjustTarget.intern_name}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-semibold text-slate-900">{rotationStart ? getCalendarMonth(rotationStart, adjustTarget.month_index - 1) : `${adjustTarget.month_index}月`}</span>
              </p>
              <p className="text-sm text-slate-700 mt-1">
                当前科室：<span className="font-bold text-teal-700">{adjustTarget.department_name}</span>
              </p>
            </div>
            <div className="flex gap-4 text-sm text-slate-600 bg-stone-50 rounded-xl px-3.5 py-2.5 border border-slate-200 flex-wrap">
              <span>开始：<span className="font-bold text-slate-900">{formatDate(adjustTarget.start_date || "")}</span></span>
              <span className="text-slate-300">|</span>
              <span>结束：<span className="font-bold text-slate-900">{formatDate(adjustTarget.end_date || "")}</span></span>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">目标系统</label>
              <select value={adjustSystem} onChange={(e) => { setAdjustSystem(e.target.value); setAdjustDeptId(""); }}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-300 transition-all text-slate-800">
                {systemOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">目标科室</label>
              <select value={adjustDeptId} onChange={(e) => setAdjustDeptId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-300 transition-all text-slate-800">
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.system_name})</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAdjustTarget(null)}
                className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-xl text-slate-700 hover:bg-stone-50 hover:text-slate-900 transition-all">取消</button>
              <button onClick={doAdjust}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-600/20 active:scale-[0.97]">确认调整</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 单实习生预分配 Modal (新手 / ready 实习生手动指定月份+科室) */}
      <Modal open={!!singleAllocIntern} size="lg"
        title={singleAllocIntern ? `为「${singleAllocIntern.name}」预分配` : ""}
        onClose={closeSingleAlloc}>
        {singleAllocIntern && departments && (
          <div className="space-y-4">
            <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl px-4 py-3">
              <p className="text-sm text-slate-700">
                实习生 <span className="font-bold text-slate-900">{singleAllocIntern.name}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                班级 <span className="font-bold text-slate-900">{singleAllocIntern.class_name}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                实习 <span className="font-bold text-slate-900">{singleAllocIntern.duration_months || 6} 个月</span>
              </p>
              <p className="text-sm text-slate-700 mt-1">
                开始日期:<span className="font-bold text-slate-900">{formatDate(singleAllocIntern.start_date || "")}</span>
              </p>
            </div>
            {/* 每个月份一行:系统 + 科室两个 select */}
            <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-2">
              {singleAllocMonths.map((m, idx) => {
                const sysOpts = (departments || []);
                const sysDepts = sysOpts.filter((d) => !m.systemId || d.system_id === m.systemId);
                return (
                  <div key={idx} className="grid grid-cols-[60px_1fr_1.4fr] gap-2 items-center">
                    <span className="text-sm font-bold text-slate-600">{getCalendarMonth(singleAllocIntern.start_date || new Date().toISOString().slice(0,10), idx)}</span>
                    <select
                      value={m.systemId}
                      onChange={(e) => {
                        const next = [...singleAllocMonths];
                        next[idx] = { systemId: e.target.value, departmentId: "" };
                        setSingleAllocMonths(next);
                      }}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300 text-slate-800">
                      <option value="">选择系统</option>
                      {[...new Set(sysOpts.map((d) => d.system_id))].map((sid) => {
                        const sysName = sysOpts.find((d) => d.system_id === sid)?.system_name || sid;
                        return <option key={sid} value={sid}>{sysName}</option>;
                      })}
                    </select>
                    <select
                      value={m.departmentId}
                      onChange={(e) => {
                        const next = [...singleAllocMonths];
                        next[idx] = { ...next[idx], departmentId: e.target.value };
                        setSingleAllocMonths(next);
                      }}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300 text-slate-800">
                      <option value="">{m.systemId ? "选择科室" : "请先选系统"}</option>
                      {sysDepts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button onClick={closeSingleAlloc}
                className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-xl text-slate-700 hover:bg-stone-50 hover:text-slate-900 transition-all">取消</button>
              <button onClick={submitSingleAlloc} disabled={allocateForOne.isPending}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-xl hover:from-amber-500 hover:to-yellow-500 disabled:opacity-50 transition-all shadow-md shadow-amber-600/20 active:scale-[0.97]">
                {allocateForOne.isPending ? "提交中..." : "确认预分配"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
