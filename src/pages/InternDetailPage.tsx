import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIntern } from "../hooks/useInterns";
import { useRotationByIntern } from "../hooks/useRotation";
import { useDepartments } from "../hooks/useDepartments";
import { useDepartmentSystems } from "../hooks/useDepartments";
import { useManualAdjust } from "../hooks/useRotation";
import { formatDate, getEndDate, getSystemColor } from "../lib/utils";
import { RotationWithNames, DepartmentWithSystem, DepartmentSystem } from "../types";

function isCompleted(r: RotationWithNames): boolean {
  if (r.status === "completed") return true;
  if (r.end_date) {
    try {
      return new Date(r.end_date) < new Date();
    } catch { return false; }
  }
  return false;
}

function isFuture(r: RotationWithNames): boolean {
  if (r.status === "completed") return false;
  if (r.end_date) {
    try {
      return new Date(r.end_date) >= new Date();
    } catch { return true; }
  }
  return true;
}

export function InternDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: intern, isLoading: loadingIntern } = useIntern(id || "");
  const { data: rotations, isLoading: loadingRotations } = useRotationByIntern(id || "");
  const { data: departments } = useDepartments();
  const { data: systems } = useDepartmentSystems();
  const adjustMutation = useManualAdjust();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");

  const operator = "管理员";

  const completed = (rotations || []).filter(isCompleted).sort((a, b) => a.month_index - b.month_index);
  // 关键修复:已完成(已结束月份)的列表也允许编辑入口,以满足"任何时候都可以"诉求。
  // 总览/详情页面都遵守同一个调整入口,不再额外做 status 拦截。
  const future = (rotations || []).filter(isFuture).sort((a, b) => a.month_index - b.month_index);

  // 固定科室实习生 — 即使 backend 无 rotation 行,也需要在「轮转计划」展示整段实习期内每个月的固定科室。
  // 派生规则:从 start_date 起,逐月覆盖 duration_months,每月虚拟一行"duration_months月"科室相同。
  const fixedDeptRows = useMemo<RotationWithNames[]>(() => {
    if (!intern || !intern.fixed_department_id || !intern.start_date || !intern.duration_months) {
      return [];
    }
    const fixedDept = (departments || []).find((d) => d.id === intern.fixed_department_id);
    if (!fixedDept) return [];
    const fixedSystem = (systems || []).find((s) => s.id === fixedDept.system_id);
    const rows: RotationWithNames[] = [];
    const baseStart = new Date(intern.start_date + "T00:00:00");
    for (let i = 0; i < intern.duration_months; i++) {
      const mStart = new Date(baseStart);
      mStart.setMonth(baseStart.getMonth() + i);
      const mEnd = new Date(mStart);
      mEnd.setMonth(mStart.getMonth() + 1);
      mEnd.setDate(mEnd.getDate() - 1);
      rows.push({
        id: `fixed-${intern.id}-${i + 1}`,
        intern_id: intern.id,
        intern_name: intern.name,
        department_id: fixedDept.id,
        department_name: fixedDept.name,
        system_name: fixedSystem?.name || "",
        month_index: i + 1,
        start_date: mStart.toISOString().slice(0, 10),
        end_date: mEnd.toISOString().slice(0, 10),
        status: "fixed",
      });
    }
    return rows;
  }, [intern, departments, systems]);

  // 「轮转计划」段:固定科室实习生用派生行,其他实习生用 backend future 行
  const planRows: RotationWithNames[] = intern?.fixed_department_id ? fixedDeptRows : future;

  const handleAdjust = (rotation: RotationWithNames) => {
    if (!selectedDeptId) {
      toast.error("请先选择目标科室");
      return;
    }
    adjustMutation.mutate(
      { assignmentId: rotation.id, newDepartmentId: selectedDeptId, operator },
      {
        onSuccess: () => {
          toast.success(`已调整「${rotation.department_name}」月份的科室`);
          setEditingId(null);
          setSelectedDeptId("");
          // 强制刷新:不仅 overview(rotation-current),还要让自己页面(rotation-intern)
          // 看到新数据。 否则出现"显示已保存但 UI 仍旧"的窗口。
          queryClient.invalidateQueries({ queryKey: ["rotation-current"] });
          queryClient.invalidateQueries({ queryKey: ["rotation-intern", id] });
          queryClient.refetchQueries({ queryKey: ["rotation-intern", id] });
        },
        onError: (e: any) => {
          // 之前 BUG:InternDetailPage 没有 onError → 后端报错被吞,用户感觉"保存失败"
          const msg = (e?.message || e?.toString() || "未知错误") as string;
          console.error("[InternDetail] manual_adjust_rotation failed:", msg);
          toast.error(`保存失败: ${msg}`);
        },
      }
    );
  };

  const startAdjust = (rotation: RotationWithNames) => {
    setEditingId(rotation.id);
    setSelectedDeptId(rotation.department_id);
  };

  // 任意科室都可选:不要按 is_active 过滤。这里是 allow-any 入口。
  // 系统仍然按 is_active 决定展示,但手动调整的 select 一律允许选 inactive 的(以满足 "任意选择")。
  const allDeptsBySystem: { system: DepartmentSystem; depts: DepartmentWithSystem[] }[] = (systems || [])
    .map((sys) => ({
      system: sys,
      depts: (departments || []).filter((d) => d.system_id === sys.id),
    }))
    .filter((g) => g.depts.length > 0);

  if (loadingIntern || loadingRotations) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!intern) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-600 text-sm font-medium">未找到该实习生</p>
        <button onClick={() => navigate("/")} className="mt-4 text-sm text-indigo-700 hover:underline font-medium">返回列表</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0 w-full px-6">
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-indigo-700 hover:text-indigo-800 mb-4 transition-colors font-medium flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回列表
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
              {intern.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900">{intern.name}</h2>
              <p className="text-base text-slate-700 font-medium">{intern.class_name}</p>
            </div>
            <span className={`text-sm px-2.5 py-1 rounded-full font-bold ${intern.fixed_department_id ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
              {intern.fixed_department_id ? "固定科室" : "轮转"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-base">
            {intern.gender && <span className="text-slate-700 font-semibold"><span className="text-slate-600">性别: </span>{intern.gender}</span>}
            {intern.phone && <span className="text-slate-700 font-semibold"><span className="text-slate-600">电话: </span>{intern.phone}</span>}
            {intern.parent_phone && <span className="text-slate-700 font-semibold"><span className="text-slate-600">家长电话: </span>{intern.parent_phone}</span>}
            {intern.graduate_school && <span className="text-slate-700 font-semibold col-span-2"><span className="text-slate-600">毕业学校: </span>{intern.graduate_school}</span>}
            <span className="text-slate-700 font-semibold"><span className="text-slate-600">开始: </span>{formatDate(intern.start_date)}</span>
            <span className="text-slate-700 font-semibold"><span className="text-slate-600">结束: </span>{formatDate(getEndDate(intern))}</span>
            <span className="text-slate-700 font-semibold"><span className="text-slate-600">时长: </span>{intern.duration_months} 个月</span>
            <span className="text-slate-700 font-semibold"><span className="text-slate-600">状态: </span>{intern.status === "active" ? "实习中" : "已归档"}</span>
            {intern.fixed_department_id && (
              <span className="text-slate-700 font-semibold"><span className="text-slate-600">固定科室: </span>{departments?.find(d => d.id === intern.fixed_department_id)?.name || "未知"}</span>
            )}
            {intern.remarks && <span className="text-slate-700 font-semibold col-span-full"><span className="text-slate-600">备注: </span>{intern.remarks}</span>}
          </div>
        </div>

        {completed.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">已完成轮转</h3>
            <div className="space-y-2">
                {completed.map((r) => {
                const color = getSystemColor(r.system_name);
                const isEditing = editingId === r.id;
                return (
                  <div key={r.id} className={`flex items-center gap-3 rounded-lg px-4 py-3 border transition-colors ${isEditing ? "bg-indigo-50/40 border-indigo-200" : "bg-stone-50 border-slate-100 opacity-70 hover:opacity-100"}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color.bar}`} />
                    <span className="text-sm text-slate-600 font-medium w-16 flex-shrink-0">第{r.month_index}个月</span>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <select
                          value={selectedDeptId}
                          onChange={(e) => setSelectedDeptId(e.target.value)}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
                        >
                          <option value="">-- 选择科室 --</option>
                          {allDeptsBySystem.map((g) => (
                            <optgroup key={g.system.id} label={g.system.name}>
                              {g.depts.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}{d.is_active ? "" : " (停用)"}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAdjust(r)}
                          disabled={adjustMutation.isPending || !selectedDeptId || selectedDeptId === r.department_id}
                          className="px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setSelectedDeptId(""); }}
                          className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 text-sm">
                          <span className="font-bold text-slate-700">{r.department_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>{r.system_name}</span>
                        </div>
                        <div className="text-sm text-slate-600 font-medium">
                          {r.start_date ? formatDate(r.start_date) : ""} ~ {r.end_date ? formatDate(r.end_date) : ""}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600">已完成</span>
                        {/* 关键修复:已完成月份也要有调整入口,允许任意时刻(含 confirmed 后)调整 */}
                        <button
                          onClick={() => startAdjust(r)}
                          className="text-sm px-2.5 py-1 rounded-md font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
                          title="调整已完成月份的科室"
                        >
                          调整
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h3 className="text-base font-bold text-slate-800 mb-4">轮转计划</h3>
          {planRows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6 font-medium">暂无轮转计划</p>
          ) : (
            <div className="space-y-2">
              {planRows.map((r) => {
                const color = getSystemColor(r.system_name);
                const isEditing = editingId === r.id;
                const isFixedRow = r.status === "fixed";
                return (
                  <div key={r.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-slate-200 hover:border-indigo-200 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color.bar}`} />
                    <span className="text-base text-slate-600 font-medium w-16 flex-shrink-0">第{r.month_index}个月</span>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <select
                          value={selectedDeptId}
                          onChange={(e) => setSelectedDeptId(e.target.value)}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
                        >
                          <option value="">-- 选择科室 --</option>
                          {allDeptsBySystem.map((g) => (
                            <optgroup key={g.system.id} label={g.system.name}>
                              {g.depts.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}{d.is_active ? "" : " (停用)"}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAdjust(r)}
                          disabled={adjustMutation.isPending || !selectedDeptId || selectedDeptId === r.department_id}
                          className="px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setSelectedDeptId(""); }}
                          className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 text-base">
                          <span className="font-bold text-slate-900">{r.department_name}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>{r.system_name}</span>
                          {isFixedRow && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-700 border border-emerald-300/60">固定科室</span>
                          )}
                        </div>
                        <div className="text-base text-slate-600 font-medium">
                          {r.start_date ? formatDate(r.start_date) : ""} ~ {r.end_date ? formatDate(r.end_date) : ""}
                        </div>
                        {!isFixedRow && (
                          <button
                            onClick={() => startAdjust(r)}
                            className="text-sm px-2.5 py-1 rounded-md font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
                          >
                            调整
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
