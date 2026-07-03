import { useState } from "react";
import { useOperationLogs, useLogCount } from "../hooks/useSettings";
import { formatTimestamp, getActionTypeLabel } from "../lib/utils";

const filterIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';

export function OperationLogsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const pageSize = 30;

  const { data: logs, isLoading } = useOperationLogs(page, pageSize, filter || undefined);
  const { data: total } = useLogCount();

  const totalPages = Math.ceil((total || 0) / pageSize);

  const actionTypes = [
    "create_intern", "update_intern", "delete_intern", "batch_import",
    "create_department", "update_department", "delete_department",
    "pre_allocate", "adjust_rotation", "confirm_allocation", "reset_allocation",
    "auto_archive", "restore_archive",
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">操作日志</h2>
          <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">共 {total || 0} 条</span>
        </div>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            dangerouslySetInnerHTML={{ __html: filterIcon }} />
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800">
            <option value="">全部类型</option>
            {actionTypes.map((t) => <option key={t} value={t}>{getActionTypeLabel(t)}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : (logs || []).length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm font-medium">暂无操作日志</div>
        ) : (
          <div className="overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <th className="p-3.5 text-left font-bold text-slate-700">时间</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">操作人</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">操作类型</th>
                  <th className="p-3.5 text-left font-bold text-slate-700">详情</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3.5 text-slate-600 text-sm font-medium">{formatTimestamp(log.created_at)}</td>
                    <td className="p-3.5 text-slate-800 font-semibold">{log.operator}</td>
                    <td className="p-3.5">
                      <span className="inline-block text-sm px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">
                        {getActionTypeLabel(log.action_type)}
                      </span>
                    </td>
                    <td className="p-3.5 text-base text-slate-700 font-medium max-w-xs truncate">{log.action_detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5 flex-shrink-0">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-30 hover:bg-stone-50 transition-colors text-slate-700 font-medium">上一页</button>
          <span className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">{page}</span> / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-30 hover:bg-stone-50 transition-colors text-slate-700 font-medium">下一页</button>
        </div>
      )}
    </div>
  );
}
