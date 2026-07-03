import { useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { useInterns } from "../hooks/useInterns";
import { useAllCurrentRotation } from "../hooks/useRotation";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { Modal } from "../components/ui/Modal";
import {
  exportRotationNoticePdf,
  exportRotationPlanCsv,
  exportDepartmentDetailCsv,
} from "../lib/api/report";

export function ReportsPage() {
  const { data: interns } = useInterns();
  const { data: rotations } = useAllCurrentRotation();
  const [statusFilter, setStatusFilter] = useState("active");
  const [showPreAllocWarning, setShowPreAllocWarning] = useState(false);

  // Default to NEXT month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [exportYear, setExportYear] = useState(nextMonth.getFullYear());
  const [exportMonth, setExportMonth] = useState(nextMonth.getMonth() + 1);

  const hasPreAlloc = (rotations || []).some((r) => r.status === "pre_alloc");
  const hasConfirmed = (rotations || []).some((r) => r.status === "confirmed");
  const isPreAllocationOnly = !hasConfirmed && hasPreAlloc;

  // r-export: 计算 + 应用 confirmed-only 护栏
  //  - 全员 confirmed 实习生 ID 集合
  //  - 未全员 confirmed 的实习生姓名列表(用于 toast 报错)
  const confirmedOnlyInternIds = new Set<string>();
  const notFullyConfirmedInterns: { id: string; name: string }[] = [];
  {
    const map = new Map<string, { total: number; confirmedCount: number; name: string }>();
    for (const r of rotations || []) {
      const cur = map.get(r.intern_id) || { total: 0, confirmedCount: 0, name: r.intern_name };
      cur.total += 1;
      if (r.status === "confirmed") cur.confirmedCount += 1;
      map.set(r.intern_id, cur);
    }
    for (const [id, cnt] of map) {
      if (cnt.total > 0 && cnt.total === cnt.confirmedCount) {
        confirmedOnlyInternIds.add(id);
      } else {
        notFullyConfirmedInterns.push({ id, name: cnt.name });
      }
    }
  }

  // 把 rotations 过滤到只剩「全员 confirmed」的实习生
  const confirmedRotations = (rotations || []).filter((r) =>
    confirmedOnlyInternIds.has(r.intern_id)
  );

  const filteredInterns = (interns || []).filter(
    (i) => statusFilter === "all" || i.status === statusFilter
  );

  const [exportPdfLoading, setExportPdfLoading] = useState(false);

  const exportPdf = async () => {
    if (exportPdfLoading) return;
    const operator = "管理员";
    // 前端护栏 r-export: 若有实习生尚未"全员 confirmed",直接 toast 拒绝并列出姓名
    if (notFullyConfirmedInterns.length > 0) {
      const names = notFullyConfirmedInterns
        .slice(0, 5)
        .map((x) => x.name)
        .join("、");
      const more = notFullyConfirmedInterns.length > 5 ? ` 等 ${notFullyConfirmedInterns.length} 人` : "";
      toast.error(
        `以下实习生未完全确认:${names}${more}\n请先在「轮转分配」页面点击「确认分配」后再导出。`,
        { duration: 5000 }
      );
      return;
    }
    toast.loading("正在准备 PDF 导出...", { id: "pdf-progress" });

    // ====== 1. 参数校验(含日志) ======
    const yNum = Number(exportYear);
    const mNum = Number(exportMonth);
    if (!Number.isFinite(yNum) || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) {
      console.warn("[PDF] 参数不合法", { yNum, mNum });
      toast.dismiss("pdf-progress");
      toast.error("年份或月份不合法");
      return;
    }

    setExportPdfLoading(true);
    try {
      // ====== 2. 调用后端拿字节 ======
      let raw: unknown;
      try {
        raw = (await exportRotationNoticePdf(yNum, mNum, operator)) as unknown;
      } catch (invokeErr: any) {
        toast.dismiss("pdf-progress");
        toast.error("调用后端失败:" + safeErr(invokeErr));
        return;
      }

      // 兼容三种返回：Uint8Array / number[] / base64-string
      let bytes: Uint8Array;
      if (raw instanceof Uint8Array) {
        bytes = raw;
      } else if (Array.isArray(raw)) {
        bytes = new Uint8Array(raw as number[]);
      } else if (typeof raw === "string") {
        try {
          const bin = atob(raw);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch {
          throw new Error("后端返回了非预期的字符串载荷");
        }
      } else {
        throw new Error("后端返回类型无法识别 (期望 Uint8Array / number[] / base64)");
      }

      if (!bytes || bytes.length === 0) {
        toast.dismiss("pdf-progress");
        toast.error("PDF 字节为空");
        return;
      }

      // ====== 3. 弹出保存对话框 ======
      const defaultName = `进修实习通知_${yNum}-${String(mNum).padStart(2, "0")}.pdf`;
      const fp = await save({
        defaultPath: defaultName,
        filters: [{ name: "PDF 文件", extensions: ["pdf"] }],
      });

      // 取消保存路径：静默退出,不报错
      if (!fp) {
        toast.dismiss("pdf-progress");
        toast("已取消导出", { icon: "ℹ️", duration: 1800 });
        return;
      }

      // ====== 4. 写文件 ======
      const target = fp.endsWith(".pdf") ? fp : `${fp}.pdf`;
      try {
        await writeFile(target, bytes);
        toast.dismiss("pdf-progress");
        toast.success(`PDF 已导出至: ${target}`);
      } catch (writeErr: any) {
        toast.dismiss("pdf-progress");
        const errMsg = safeErr(writeErr);
        toast.error("写入文件失败：" + errMsg);
      }
    } catch (e: any) {
      toast.dismiss("pdf-progress");
      const errMsg = safeErr(e);
      toast.error("导出失败：" + errMsg);
    } finally {
      setExportPdfLoading(false);
    }
  };

  // 工具：把任意 error 解析为可读消息,绝不返回 undefined
  function safeErr(e: any): string {
    if (!e) return "未知错误";
    if (typeof e === "string") return e;
    if (typeof e.message === "string" && e.message) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  const exportInternList = async () => {
    // r-export: 全员 confirmed 护栏 — 与 exportPdf 相同语义
    if (notFullyConfirmedInterns.length > 0) {
      const names = notFullyConfirmedInterns
        .slice(0, 5)
        .map((x) => x.name)
        .join("、");
      const more = notFullyConfirmedInterns.length > 5 ? ` 等 ${notFullyConfirmedInterns.length} 人` : "";
      toast.error(
        `以下实习生未完全确认:${names}${more}\n请先在「轮转分配」页面点击「确认分配」后再导出。`,
        { duration: 5000 }
      );
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(
        filteredInterns.map((i) => ({
          "班级": i.class_name, "姓名": i.name, "性别": i.gender || "",
          "本人电话": i.phone || "", "家长电话": i.parent_phone || "",
          "毕业学校": i.graduate_school || "", "开始日期": i.start_date,
          "实习时长": `${i.duration_months}个月`, "状态": i.status === "active" ? "实习中" : "已归档",
          "备注": i.remarks || "",
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "实习生名单");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const fp = await save({
        defaultPath: `实习生名单_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel 文件", extensions: ["xlsx"] }]
      });
      if (fp) {
        const p = fp.endsWith('.xlsx') ? fp : fp + '.xlsx';
        const uint8 = new Uint8Array(buf);
        await writeFile(p, uint8);
        toast.success("导出成功！");
      }
    } catch (e: any) {
      toast.error("导出失败：" + (e.message || "未知错误"));
    }
  };

  const exportRotationPlan = async () => {
    if (isPreAllocationOnly) { setShowPreAllocWarning(true); return; }
    // r-export: confirmed-only 护栏
    if (notFullyConfirmedInterns.length > 0) {
      const names = notFullyConfirmedInterns
        .slice(0, 5)
        .map((x) => x.name)
        .join("、");
      const more = notFullyConfirmedInterns.length > 5 ? ` 等 ${notFullyConfirmedInterns.length} 人` : "";
      toast.error(
        `以下实习生未完全确认:${names}${more}\n请先在「轮转分配」页面点击「确认分配」后再导出。`,
        { duration: 5000 }
      );
      return;
    }
    try {
      const maxMonth = Math.max(...(rotations || []).map((r) => r.month_index), 0);
      const internIds = [...new Set((rotations || []).map((r) => r.intern_id))];
      const internMap = new Map((rotations || []).map((r) => [r.intern_id, r.intern_name]));
      const rotStart = rotations?.[0]?.start_date;
      const headers = ["实习生"];
      const monthLabel = (i: number) => {
        if (rotStart) {
          const d = new Date(rotStart + "T00:00:00");
          d.setMonth(d.getMonth() + i - 1);
          return `${d.getFullYear()}年${d.getMonth() + 1}月`;
        }
        return `第${i}月`;
      };
      for (let i = 1; i <= maxMonth; i++) headers.push(monthLabel(i));
      const data = internIds.map((id) => {
        const row: Record<string, string> = { "实习生": internMap.get(id) || "" };
        for (let i = 1; i <= maxMonth; i++) {
          const r = (rotations || []).find((r) => r.intern_id === id && r.month_index === i);
          row[monthLabel(i)] = r ? `${r.department_name}(${r.system_name})` : "-";
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "轮转计划");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const fp = await save({
        defaultPath: `轮转计划_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel 文件", extensions: ["xlsx"] }]
      });
      if (fp) {
        const p = fp.endsWith('.xlsx') ? fp : fp + '.xlsx';
        const uint8 = new Uint8Array(buf);
        await writeFile(p, uint8);
        toast.success("导出成功！");
      }
    } catch (e: any) {
      toast.error("导出失败：" + (e.message || "未知错误"));
    }
  };

  const exportDeptDetail = async () => {
    if (isPreAllocationOnly) { setShowPreAllocWarning(true); return; }
    // r-export: confirmed-only 护栏
    if (notFullyConfirmedInterns.length > 0) {
      const names = notFullyConfirmedInterns
        .slice(0, 5)
        .map((x) => x.name)
        .join("、");
      const more = notFullyConfirmedInterns.length > 5 ? ` 等 ${notFullyConfirmedInterns.length} 人` : "";
      toast.error(
        `以下实习生未完全确认:${names}${more}\n请先在「轮转分配」页面点击「确认分配」后再导出。`,
        { duration: 5000 }
      );
      return;
    }
    try {
      const data = (rotations || []).map((r) => ({
        "实习生": r.intern_name, "科室": r.department_name,
        "系统": r.system_name, "轮转月": r.start_date ? `${new Date(r.start_date + "T00:00:00").getFullYear()}年${new Date(r.start_date + "T00:00:00").getMonth() + 1}月` : `第${r.month_index}个月`,
        "状态": r.status === "confirmed" ? "已确认" : r.status === "pre_alloc" ? "预分配" : "已完成",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "科室轮转明细");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const fp = await save({
        defaultPath: `科室轮转明细_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel 文件", extensions: ["xlsx"] }]
      });
      if (fp) {
        const p = fp.endsWith('.xlsx') ? fp : fp + '.xlsx';
        const uint8 = new Uint8Array(buf);
        await writeFile(p, uint8);
        toast.success("导出成功！");
      }
    } catch (e: any) {
      toast.error("导出失败：" + (e.message || "未知错误"));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex-shrink-0">报表导出</h2>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3 }}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">实习生名册</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">导出全部实习生基本信息</p>
            <div className="flex items-center gap-2 mb-3">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40">
                <option value="active">实习中</option>
                <option value="archived">已归档</option>
                <option value="all">全部</option>
              </select>
              <span className="text-xs text-slate-500">{filteredInterns.length} 人</span>
            </div>
            <button onClick={exportInternList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-lg hover:from-amber-500 hover:to-yellow-500 transition-all duration-200 shadow-lg shadow-amber-600/20 active:scale-[0.97]">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>导出 Excel</span>
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">轮转计划表</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">导出完整轮转矩阵（月份×实习生）</p>
            <button onClick={exportRotationPlan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-lg hover:from-amber-500 hover:to-yellow-500 transition-all duration-200 shadow-lg shadow-amber-600/20 active:scale-[0.97]">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>导出 Excel</span>
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">科室轮转明细</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">按科室汇总各月实习生名单</p>
            <button onClick={exportDeptDetail}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-lg hover:from-amber-500 hover:to-yellow-500 transition-all duration-200 shadow-lg shadow-amber-600/20 active:scale-[0.97]">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>导出 Excel</span>
            </button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 max-w-md hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">进修、实习通知导出</h3>
          </div>
          <p className="text-sm text-slate-600 mb-3">按月份导出进修、实习通知 PDF</p>
          <div className="flex items-center gap-2 mb-3">
            <input type="number" value={exportYear} onChange={(e) => setExportYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40" />
            <span className="text-sm text-slate-500">年</span>
            <input type="number" min={1} max={12} value={exportMonth} onChange={(e) => setExportMonth(Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40" />
            <span className="text-sm text-slate-500">月</span>
          </div>
          <button onClick={exportPdf} disabled={exportPdfLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-lg hover:from-amber-500 hover:to-yellow-500 transition-all duration-200 shadow-lg shadow-amber-600/20 active:scale-[0.97] ${exportPdfLoading ? "opacity-60 cursor-not-allowed" : ""}`}>
            <FileText className="w-3.5 h-3.5" />
            <span>{exportPdfLoading ? "生成中..." : "导出 PDF"}</span>
          </button>
        </motion.div>
      </div>

      <Modal open={showPreAllocWarning} title="提示" onClose={() => setShowPreAllocWarning(false)}>
        <div className="text-center py-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-700 font-medium">
            当前为预分配状态，请先完成正式分配后再导出
          </p>
          <button
            onClick={() => setShowPreAllocWarning(false)}
            className="mt-4 px-5 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            知道了
          </button>
        </div>
      </Modal>


    </motion.div>
  );
}