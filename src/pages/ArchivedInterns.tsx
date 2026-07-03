import { useState } from "react";
import { useArchivedInterns, useRestoreArchive } from "../hooks/useArchive";
import { useUpdateIntern } from "../hooks/useInterns";
import { useRotationByIntern } from "../hooks/useRotation";
import { Modal } from "../components/ui/Modal";
import { Intern, RotationWithNames } from "../types";
import { formatDate, getEndDate } from "../lib/utils";

const searchIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const backIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
const restoreIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
const eyeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

function RotationHistory({ internId }: { internId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: rotations, isLoading } = useRotationByIntern(expanded ? internId : "");

  return (
    <div className="mt-3">
      <button onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-bold transition-colors">
        {expanded ? "收起轮转记录" : "查看轮转记录"} ({rotations?.length || 0} 条)
      </button>
      {expanded && (
        isLoading ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <div className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
            加载中...
          </div>
        ) : rotations && rotations.length > 0 ? (
          <div className="mt-2 space-y-1">
            {rotations.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm bg-white rounded px-2.5 py-1.5 border border-slate-200">
                <span className="text-slate-800 font-semibold">{r.department_name}</span>
                <span className="text-slate-600">
                  {r.month_index}月 {r.start_date ? `(${formatDate(r.start_date)}${r.end_date ? ` ~ ${formatDate(r.end_date)}` : ""})` : ""}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full font-medium ${
                    r.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                    r.status === "confirmed" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>{r.status === "completed" ? "已完成" : r.status === "confirmed" ? "已确认" : "预分配"}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-500">暂无轮转记录</div>
        )
      )}
    </div>
  );
}

export function ArchivedInternsPage() {
  const [search, setSearch] = useState("");
  const { data: interns, isLoading } = useArchivedInterns();
  const restoreArchive = useRestoreArchive();
  const updateIntern = useUpdateIntern();
  const operator = "管理员";

  const [detailIntern, setDetailIntern] = useState<Intern | null>(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoIntern, setUndoIntern] = useState<Intern | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const filtered = (interns || []).filter((i) =>
    !search || i.name.includes(search) || i.class_name.includes(search)
  );

  const handleUndoClick = (intern: Intern) => {
    setUndoIntern(intern);
    setEditStartDate(intern.start_date);
    setEditEndDate(intern.end_date || "");
    setShowUndoModal(true);
  };

  const handleConfirmUndo = () => {
    if (!undoIntern) return;
    const updated: Intern = {
      ...undoIntern,
      start_date: editStartDate,
      end_date: editEndDate || undefined,
      updated_at: Math.floor(Date.now() / 1000),
    };
    updateIntern.mutate({ intern: updated, operator }, {
      onSuccess: () => {
        restoreArchive.mutate({ internId: undoIntern.id, operator }, {
          onSuccess: () => {
            setShowUndoModal(false);
            setUndoIntern(null);
            setDetailIntern(null);
          },
        });
      },
    });
  };

  if (detailIntern) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0">
          <button onClick={() => setDetailIntern(null)}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4 transition-colors font-medium"
            dangerouslySetInnerHTML={{ __html: backIcon + ' 返回归档列表' }} />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold flex-shrink-0">
                  {detailIntern.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{detailIntern.name}</h3>
                  <span className="text-sm text-slate-600 font-medium">{detailIntern.class_name}</span>
                </div>
              </div>
              <button onClick={() => handleUndoClick(detailIntern)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                dangerouslySetInnerHTML={{ __html: restoreIcon + ' <span>撤销归档</span>' }} />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div><span className="text-slate-600 font-semibold">性别</span><p className="text-slate-900 font-bold">{detailIntern.gender || "-"}</p></div>
                <div><span className="text-slate-600 font-semibold">电话</span><p className="text-slate-900 font-bold">{detailIntern.phone || "-"}</p></div>
                <div><span className="text-slate-600 font-semibold">家长电话</span><p className="text-slate-900 font-bold">{detailIntern.parent_phone || "-"}</p></div>
                <div><span className="text-slate-600 font-semibold">毕业院校</span><p className="text-slate-900 font-bold">{detailIntern.graduate_school || "-"}</p></div>
                <div><span className="text-slate-600 font-semibold">开始日期</span><p className="text-slate-900 font-bold">{formatDate(detailIntern.start_date)}</p></div>
                <div><span className="text-slate-600 font-semibold">结束日期</span><p className="text-slate-900 font-bold">{formatDate(getEndDate(detailIntern))}</p></div>
                <div><span className="text-slate-600 font-semibold">实习时长</span><p className="text-slate-900 font-bold">{detailIntern.duration_months} 个月</p></div>
                <div><span className="text-slate-600 font-semibold">状态</span><p className="text-slate-900 font-bold">
                  {detailIntern.fixed_department_id ? "固定科室" : "轮转"}
                </p></div>
              </div>
              {detailIntern.remarks && (
                <div className="mt-3 text-sm">
                  <span className="text-slate-600 font-semibold">备注</span>
                  <p className="text-slate-900 mt-0.5 bg-stone-50 rounded-lg p-2.5 font-medium">{detailIntern.remarks}</p>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3">
              <RotationHistory internId={detailIntern.id} />
            </div>
          </div>
        </div>

        <Modal open={showUndoModal} title={`撤销归档 - ${undoIntern?.name || ""}`} onClose={() => setShowUndoModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">姓名</label>
                <input readOnly value={undoIntern?.name || ""}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-slate-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">班级</label>
                <input readOnly value={undoIntern?.class_name || ""}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-slate-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">开始日期</label>
                <input type="date" value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">结束日期</label>
                <input type="date" value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowUndoModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-stone-50 transition-colors">取消</button>
              <button onClick={handleConfirmUndo}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors">确定撤销</button>
            </div>
          </div>
        </Modal>
      </div>
        </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="animate-fadeIn flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">归档列表</h2>
            <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">{filtered.length} 人</span>
          </div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              dangerouslySetInnerHTML={{ __html: searchIcon }} />
            <input placeholder="搜索姓名/班级..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm w-56 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="text-slate-300 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" className="inline-block"><path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"/><path d="M3 10v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8"/><path d="M12 12v4"/><path d="M8 12h8"/></svg>
            </div>
            <p className="text-slate-600 text-sm">暂无归档记录</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((intern) => (
            <div key={intern.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer"
              onClick={() => setDetailIntern(intern)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {intern.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">{intern.name}</span>
                    <span className="text-base text-slate-700 ml-2 font-medium">{intern.class_name}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(e) => { e.stopPropagation(); setDetailIntern(intern); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    title="详情" dangerouslySetInnerHTML={{ __html: eyeIcon }} />
                </div>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base text-slate-800">
                  {intern.gender && <span className="font-medium">性别: {intern.gender}</span>}
                  {intern.phone && <span className="font-medium">电话: {intern.phone}</span>}
                  {intern.graduate_school && <span className="col-span-2 font-medium">毕业: {intern.graduate_school}</span>}
                  <span className="col-span-2 font-medium">开始: {formatDate(intern.start_date)} | 结束: {formatDate(getEndDate(intern))} | {intern.duration_months}月</span>
                  <span className="col-span-2">
                    {intern.fixed_department_id
                      ? <span className="inline-flex items-center gap-1 text-slate-800 font-bold">固定科室</span>
                      : <span className="inline-flex items-center gap-1 text-slate-800 font-bold">轮转</span>}
                  </span>
                  {intern.remarks && <span className="col-span-2 text-slate-500 truncate font-medium">备注: {intern.remarks}</span>}
                </div>
              </div>

            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
