import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { useInterns, useCreateIntern, useUpdateIntern, useDeleteIntern, useBatchImport, useSearchInterns } from "../hooks/useInterns";
import { useDepartments } from "../hooks/useDepartments";
import { InternForm } from "../components/interns/InternForm";
import { InternImport } from "../components/interns/InternImport";
import { Modal } from "../components/ui/Modal";
import { Intern } from "../types";
import { formatDate, getEndDate } from "../lib/utils";

const searchIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const addIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const importIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// 分配状态徽章配色 (与文档/Rotation page 保持一致)
// ready / pre_allocated / confirmed / completed / 未知
const allocationStatusConfig: Record<string, { label: string; className: string }> = {
  ready:          { label: "未分配",   className: "bg-slate-100 text-slate-700 border border-slate-200/60" },
  pre_allocated:  { label: "已预分配", className: "bg-amber-100 text-amber-700 border border-amber-200/60" },
  confirmed:      { label: "已确认",   className: "bg-emerald-100 text-emerald-700 border border-emerald-200/60" },
  completed:      { label: "已完成",   className: "bg-indigo-100 text-indigo-700 border border-indigo-200/60" },
};

export function CurrentInternsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Intern | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const { data: departments } = useDepartments();
  const operator = "管理员";

  useEffect(() => {
    invoke("auto_archive");
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const { data: interns, isLoading } = useInterns(debouncedSearch ? undefined : "active");
  const searchMutation = useSearchInterns();
  const createIntern = useCreateIntern();
  const updateIntern = useUpdateIntern();
  const deleteIntern = useDeleteIntern();
  const batchImport = useBatchImport();

  const [searchResults, setSearchResults] = useState<Intern[] | null>(null);

  useEffect(() => {
    if (!debouncedSearch) { setSearchResults(null); return; }
    searchMutation.mutate({ keyword: debouncedSearch, status: "active" }, {
      onSuccess: (data) => setSearchResults(data),
    });
  }, [debouncedSearch]);

  const displayed = searchResults !== null ? searchResults : (interns || []);
  const [filterClass, setFilterClass] = useState("");
  // 分配状态维度筛选: ready / pre_allocated / confirmed / completed / all
  // (不与现有 intern.status(active/archived) 维度冲突,二者并存)
  const [filterAlloc, setFilterAlloc] = useState<string>("all");

  const classOptions = [...new Set((interns || []).map((i) => i.class_name).filter(Boolean))];
  const filtered = displayed
    .filter((i) => !filterClass || i.class_name === filterClass)
    .filter((i) => {
      if (filterAlloc === "all") return true;
      const s = i.allocation_status || "ready";
      return s === filterAlloc;
    });

  const handleSave = (data: Partial<Intern>) => {
    const now = Math.floor(Date.now() / 1000);
    if (editing?.id) {
      // 编辑模式:不动 allocation_status — 由后端 update_intern 根据 fixed_department_id 变化联动维护
      updateIntern.mutate({ intern: { ...editing, ...data, updated_at: now } as Intern, operator }, {
        onSuccess: () => {
          toast.success(`${data.name || editing.name} 修改成功`, { duration: 2500 });
        },
        onError: (e: any) => {
          toast.error("保存失败:" + (e?.message || JSON.stringify(e) || "未知错误"), { duration: 4500 });
        },
      });
    } else {
      // 新增模式:固定科室 → allocation_status='confirmed' 即时同步(无需走 ready 阶段)
      //          轮转型   → allocation_status='ready',等用户后续在轮转分配页面一键预分配
      const initialAlloc = data.fixed_department_id && data.fixed_department_id.length > 0
        ? "confirmed"
        : "ready";
      createIntern.mutate({
        // 修复:f19 — 新增时显式给 allocation_status 默认值 "ready",否则后端 Rust 端 dao::interns::Intern.allocation_status 是必填 String,serde 反序列化失败 → "未知错误"
        // r-f22:固定科室实习生在新增时就直接 'confirmed',联动轮转页面自动不入矩阵
        intern: { id: crypto.randomUUID(), ...data, status: "active", allocation_status: initialAlloc, created_at: now, updated_at: now } as Intern,
        operator,
      }, {
        onSuccess: () => {
          toast.success(`${data.name} 添加成功`, { duration: 2500 });
        },
        onError: (e: any) => {
          // f19: 把 e 本身也暴露,避免「未知错误」遮挡真正的根因(JSON.stringify 让 Rust std::fmt::Display / serde 错误能被看见)
          toast.error("新增失败:" + (e?.message || JSON.stringify(e) || "未知错误"), { duration: 4500 });
        },
      });
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleImport = (interns: Intern[]) => {
    if (!interns || interns.length === 0) {
      toast("没有可导入的实习生记录", { icon: "⚠️" });
      return;
    }
    batchImport.mutate({ interns, operator }, {
      onSuccess: (count) => {
        toast.success(`成功导入 ${count ?? interns.length} 名实习生`, { duration: 3500 });
        setShowImport(false);
      },
      onError: (e: any) => {
        toast.error("导入失败：" + (e?.message || "未知错误"), { duration: 5000 });
      },
    });
  };

  const handleDelete = (intern: Intern) => {
    if (confirm(`确定删除 ${intern.name}？`)) {
      deleteIntern.mutate({ id: intern.id, operator });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const wb = XLSX.utils.book_new();

      const headers = [
        "班级", "姓名", "性别", "本人电话", "家长电话",
        "毕业学校", "开始日期", "结束日期", "轮转类型", "固定科室", "备注",
      ];
      const example = [
        "2024护理1班", "张三", "男", "13800000000", "13900000000",
        "某医学院", "2026-01-01", "2026-07-01", "轮转", "", "示例数据可删除",
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map(() => ({ wch: 14 }));
      XLSX.utils.book_append_sheet(wb, ws, "模板");

      const instructions = [
        ["字段", "是否必填", "格式说明", "示例"],
        ["班级", "必填", "文本", "2024护理1班"],
        ["姓名", "必填", "文本", "张三"],
        ["性别", "可选", "男 / 女", "男"],
        ["本人电话", "可选", "11位手机号", "13800000000"],
        ["家长电话", "可选", "11位手机号", "13900000000"],
        ["毕业学校", "可选", "文本", "某医学院"],
        ["开始日期", "可选", "YYYY-MM-DD，留空则使用今日", "2026-01-01"],
        ["结束日期", "可选", "YYYY-MM-DD，留空则自动 +180 天", "2026-07-01"],
        ["轮转类型", "可选", "轮转 / 固定科室", "轮转"],
        ["固定科室", "可选", "仅当轮转类型=固定科室时填写，填写科室名称", "内科"],
        ["备注", "可选", "文本", ""],
      ];
      const wsInst = XLSX.utils.aoa_to_sheet(instructions);
      wsInst["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 40 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsInst, "说明");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const fp = await save({
        defaultPath: "导入模板.xlsx",
        filters: [{ name: "Excel 文件", extensions: ["xlsx"] }],
      });
      if (!fp) { toast("已取消下载", { icon: "ℹ️" }); return; }
      const filePath = fp.endsWith('.xlsx') ? fp : fp + '.xlsx';
      await writeFile(filePath, new Uint8Array(buf));
      console.log("Template saved to:", filePath, "size:", buf.length);
      toast.success("模板下载成功！");
    } catch (e: any) {
      console.error("Download failed:", e);
      toast.error("模板下载失败：" + (e.message || "未知错误"));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-shrink-0"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">当前实习</h2>
          <button onClick={() => { invoke("auto_archive"); queryClient.invalidateQueries(); }}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
            title="刷新">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">{filtered.length} 人</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              dangerouslySetInnerHTML={{ __html: searchIcon }} />
            <input placeholder="搜索姓名/班级/电话..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm w-56 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 transition-all placeholder:text-slate-400" />
          </div>
          {classOptions.length > 1 && (
            <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 transition-all text-slate-800">
              <option value="">全部班级</option>
              {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* 分配状态维度筛选 (与班级/实习进度维度并存) */}
          <select value={filterAlloc} onChange={(e) => setFilterAlloc(e.target.value)}
            title="按分配状态筛选"
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 transition-all text-slate-800">
            <option value="all">分配:全部</option>
            <option value="ready">未分配</option>
            <option value="pre_allocated">已预分配</option>
            <option value="confirmed">已确认</option>
            <option value="completed">已完成</option>
          </select>
          <button onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-stone-50 hover:border-amber-500/30 transition-all duration-200 active:scale-[0.97]"
            dangerouslySetInnerHTML={{ __html: importIcon.replace('d="M21 15v4a2', 'd="M21 15v4a2') + ' <span>下载导入模板</span>' }} />
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-xl hover:from-amber-500 hover:to-yellow-500 transition-all duration-200 shadow-lg shadow-amber-600/20 active:scale-[0.97]"
            dangerouslySetInnerHTML={{ __html: addIcon + ' <span>新增</span>' }} />
          <button onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-stone-50 hover:border-amber-500/30 transition-all duration-200 active:scale-[0.97]"
            dangerouslySetInnerHTML={{ __html: importIcon + ' <span>导入数据</span>' }} />
        </div>
      </div>

      <Modal open={showForm} title={editing ? "编辑实习生" : "新增实习生"} onClose={() => { setShowForm(false); setEditing(null); }}>
        <InternForm initial={editing || undefined} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
      </Modal>

      <Modal open={showImport} title="批量导入实习生" onClose={() => setShowImport(false)} size="xl">
        <InternImport
          importing={batchImport.isPending}
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      </Modal>

      </motion.div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="text-slate-300 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" className="inline-block"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <p className="text-slate-600 text-sm">{search ? "未找到匹配的实习生" : "暂无实习生，点击「导入」或「新增」添加"}</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((intern, idx) => (
            <motion.div
              key={intern.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.3 }}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className={`group rounded-2xl border p-5 cursor-pointer transition-all duration-200 ${
                intern.fixed_department_id
                  ? "bg-gradient-to-br from-sky-100 to-blue-100 border-blue-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5"
                  : "bg-white border-slate-200 hover:border-teal-300/80 hover:shadow-md hover:shadow-teal-500/5"
              }`}
              onClick={() => navigate(`/interns/${intern.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm ${
                    intern.fixed_department_id
                      ? "bg-gradient-to-br from-blue-500 to-sky-600 text-white shadow-blue-500/20"
                      : "bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-teal-500/20"
                  }`}>
                    {intern.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    {/* 第 1 行:姓名(独占一行) */}
                    <span className="font-bold text-slate-900 flex items-center gap-1.5 text-base">
                      {intern.name}
                    </span>
                    {/* 第 2 行:类型徽章 + 分配状态徽章 — 去掉前面圆点 + 去掉「分配:」前缀 */}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {/* 类型:轮转 / 固定 */}
                      {intern.fixed_department_id
                        ? (
                          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200/60">
                            固定
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 border border-indigo-200/60">
                            轮转
                          </span>
                        )}
                      {/* 分配状态:未分配 / 已预分配 / 已确认 / 已完成 / 未知 — 不带前缀 */}
                      {(() => {
                        const cfg = allocationStatusConfig[intern.allocation_status || ""];
                        if (cfg) {
                          return (
                            <span
                              title={`分配状态:${intern.allocation_status}`}
                              className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md border ${cfg.className}`}
                            >
                              {cfg.label}
                            </span>
                          );
                        }
                        return (
                          <span
                            title="分配状态:未知(向后兼容旧数据)"
                            className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200/60"
                          >
                            未知
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditing(intern); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    title="编辑" dangerouslySetInnerHTML={{ __html: editIcon }} />
                  <button onClick={() => handleDelete(intern)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除" dangerouslySetInnerHTML={{ __html: deleteIcon }} />
                </div>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base text-slate-800">
                  {intern.gender && <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{intern.gender}</span>}
                  {intern.phone && <span className="flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{intern.phone}</span>}
                  {intern.graduate_school && <span className="col-span-2 flex items-center gap-1.5 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{intern.graduate_school}</span>}
                  <span className="col-span-2 flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    {formatDate(intern.start_date)} → {formatDate(getEndDate(intern))}
                  </span>
                  {intern.remarks && <span className="col-span-2 text-slate-500 truncate flex items-center gap-1.5 text-base"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{intern.remarks}</span>}
                </div>
              </div>
            </motion.div>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
