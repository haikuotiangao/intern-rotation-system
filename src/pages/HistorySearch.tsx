import { useState, useEffect, useRef } from "react";
import { useSearchInterns } from "../hooks/useInterns";
import { useRotationByIntern } from "../hooks/useRotation";
import { Intern, RotationWithNames } from "../types";
import { formatDate } from "../lib/utils";

const searchIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const backIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';

export function HistorySearchPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const searchMutation = useSearchInterns();
  const [results, setResults] = useState<Intern[] | null>(null);
  const [selectedIntern, setSelectedIntern] = useState<string | null>(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => {
    if (!debouncedSearch) { setResults(null); return; }
    searchMutation.mutate({ keyword: debouncedSearch }, {
      onSuccess: (data) => setResults(data),
    });
  }, [debouncedSearch]);

  const { data: internRotations, isLoading: rotLoading } = useRotationByIntern(selectedIntern || "");

  const selectedName = selectedIntern
    ? results?.find((i) => i.id === selectedIntern)?.name || ""
    : "";
  const selectedStatus = selectedIntern
    ? results?.find((i) => i.id === selectedIntern)?.status || ""
    : "";

  if (selectedIntern) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-6 flex-shrink-0">
          <button onClick={() => setSelectedIntern(null)}
            className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:text-indigo-800 font-bold transition-colors"
            dangerouslySetInnerHTML={{ __html: backIcon + ' <span>返回搜索</span>' }} />
          <h2 className="text-xl font-bold text-slate-900">{selectedName}</h2>
          <span className={`text-sm px-2.5 py-0.5 rounded-full font-bold ${
            selectedStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}>
            {selectedStatus === "active" ? "实习中" : "已归档"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {rotLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : internRotations && internRotations.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[23px] top-8 bottom-8 w-0.5 bg-slate-200" />
              <div className="space-y-3">
                {internRotations.map((r: RotationWithNames) => (
                  <div key={r.id} className="relative flex items-start gap-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4 ml-2 hover:shadow-md transition-shadow">
                    <div className={`flex-shrink-0 w-[46px] h-[46px] rounded-full flex items-center justify-center text-sm font-bold z-10 ${
                      r.system_name.includes("内") ? "bg-indigo-100 text-indigo-700" : "bg-rose-100 text-rose-700"
                    }`}>
                      {r.month_index}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{r.start_date ? `${new Date(r.start_date + "T00:00:00").getFullYear()}年${new Date(r.start_date + "T00:00:00").getMonth() + 1}月` : `第 ${r.month_index} 个月`}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          r.system_name.includes("内") ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-700"
                        }`}>{r.system_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          r.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                          r.status === "completed" ? "bg-slate-100 text-slate-600" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {r.status === "confirmed" ? "已确认" : r.status === "completed" ? "已完成" : "预分配"}
                        </span>
                      </div>
                      <div className="text-base font-bold text-slate-800 mt-1">{r.department_name}</div>
                      {r.start_date && r.end_date && (
                        <div className="text-base text-slate-700 font-medium mt-1">
                          {formatDate(r.start_date)} ~ {formatDate(r.end_date)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-600 text-sm font-medium">该实习生暂无轮转记录</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">信息检索</h2>
          <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {results !== null ? `${results.length} 条结果` : "搜索全部记录"}
          </span>
        </div>
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            dangerouslySetInnerHTML={{ __html: searchIcon }} />
          <input placeholder="搜索姓名/班级..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {results === null ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <div className="text-slate-300 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" className="inline-block"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-slate-600 text-sm font-medium">输入姓名或班级搜索实习生（含已归档）</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="text-slate-300 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" className="inline-block"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-slate-600 text-sm font-medium">未找到匹配的记录</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <th className="p-3.5 text-left font-bold text-slate-700">姓名</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">班级</th>
                  <th className="p-3.5 text-left font-bold text-slate-700 hidden sm:table-cell">性别</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">实习期</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">状态</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {results.map((intern) => (
                  <tr key={intern.id} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{intern.name}</td>
                    <td className="p-3.5 text-slate-700 font-medium">{intern.class_name}</td>
                    <td className="p-3.5 text-slate-700 font-medium hidden sm:table-cell">{intern.gender || "-"}</td>
                    <td className="p-3.5 text-slate-700 font-medium">{formatDate(intern.start_date)}</td>
                    <td className="p-3.5">
                      <span className={`text-sm px-2.5 py-0.5 rounded-full font-bold ${
                        intern.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {intern.status === "active" ? "实习中" : "已归档"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <button onClick={() => setSelectedIntern(intern.id)}
                        className="text-sm text-indigo-700 hover:text-indigo-800 font-bold transition-colors">
                        查看轮转
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
