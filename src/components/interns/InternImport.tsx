import { useState, useRef, useCallback, DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Intern } from "../../types";
import { useDepartmentSystems, useDepartments } from "../../hooks/useDepartments";

interface InternImportProps {
  /** 当 isPending=true 时按钮显示 spinner 并禁用 */
  importing?: boolean;
  onImport: (interns: Intern[]) => void;
  onCancel: () => void;
}

export function InternImport({ importing = false, onImport, onCancel }: InternImportProps) {
  const [preview, setPreview] = useState<Intern[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: systems } = useDepartmentSystems();
  const { data: departments } = useDepartments();
  const nonRotationSystemIds = (systems ?? [])
    .filter((s) => !s.is_rotation)
    .map((s) => s.id);
  const nonRotationDepts = (departments ?? [])
    .filter((d) => nonRotationSystemIds.includes(d.system_id));
  const deptNameToId: Record<string, string> = {};
  nonRotationDepts.forEach((d) => { deptNameToId[d.name] = d.id; });

  /**
   * 解析 Excel/CSV 文件 → 内部预览数据。
   * 同步接受一个 Blob | File 对象,既能被 input.change 也能被拖拽事件复用。
   */
  const parseFile = useCallback((file: File) => {
    setError("");
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) {
          setError("文件为空或格式不正确");
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
          setError("文件不包含任何工作表");
          return;
        }
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (rows.length === 0) {
          setError("文件为空或格式不正确");
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        const fallbackStart = new Date().toISOString().slice(0, 10);
        const fallbackEnd = (() => {
          const d = new Date();
          d.setDate(d.getDate() + 180);
          return d.toISOString().slice(0, 10);
        })();

        const interns: Intern[] = rows.map((row) => {
          const fixedDeptName = String(row["固定科室"] || row["fixed_department"] || "").trim();
          const fixedDeptId = fixedDeptName ? (deptNameToId[fixedDeptName] || "") : "";
          const rotationType = String(row["轮转类型"] || row["rotation_type"] || "").trim();
          const startDate = String(row["开始日期"] || row["start_date"] || "").trim() || fallbackStart;
          const endDate = String(row["结束日期"] || row["end_date"] || "").trim() || fallbackEnd;
          const sd = new Date(startDate);
          const ed = new Date(endDate);
          const days = Math.max(1, Math.round((ed.getTime() - sd.getTime()) / 86400000));
          const months = Math.max(1, Math.round(days / 30));
          return {
            id: crypto.randomUUID(),
            class_name: String(row["班级"] || row["class"] || ""),
            name: String(row["姓名"] || row["name"] || ""),
            gender: String(row["性别"] || row["gender"] || ""),
            phone: String(row["本人电话"] || row["phone"] || ""),
            parent_phone: String(row["家长电话"] || row["parent_phone"] || ""),
            graduate_school: String(row["毕业学校"] || row["graduate_school"] || ""),
            remarks: String(row["备注"] || row["remarks"] || ""),
            duration_months: months,
            start_date: startDate,
            end_date: endDate,
            status: "active",
            allocation_status: "ready",
            created_at: now,
            updated_at: now,
            fixed_department_id: rotationType === "固定科室" || fixedDeptId ? fixedDeptId : "",
          };
        });

        const empty = interns.filter((r) => !r.name);
        if (empty.length > 0) {
          setError(`检测到 ${empty.length} 行缺少「姓名」字段,请补齐后再上传`);
          return;
        }

        setPreview(interns);
      } catch {
        setError("文件解析失败,请确认是有效的 .xlsx 文件");
      }
    };
    reader.onerror = () => setError("文件读取失败");
    reader.readAsArrayBuffer(file);
  }, [deptNameToId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
    // 清空 value 以允许同名文件再次上传
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("仅支持 .xlsx / .xls / .csv 文件");
      return;
    }
    parseFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  return (
    <div className="space-y-5">
      {/* 上传区 / 拖拽区 */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={() => !importing && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 px-6 py-8 text-center select-none
          ${importing
            ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
            : dragging
              ? "border-amber-500 bg-amber-50/60 scale-[1.01] shadow-md shadow-amber-500/10"
              : "border-slate-300 bg-slate-50/40 hover:border-amber-400 hover:bg-amber-50/40"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          disabled={importing}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
            ${dragging ? "bg-amber-100 text-amber-600" : "bg-white text-slate-500 shadow-sm border border-slate-200"}`}>
            <Upload className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="text-sm font-medium text-slate-700">
            {dragging ? "释放鼠标即可上传" : (
              <>
                点击或拖拽 <span className="text-amber-600">.xlsx / .xls / .csv</span> 文件到此处
              </>
            )}
          </div>
          <div className="text-xs text-slate-500">
            支持的列:班级 / 姓名 / 性别 / 本人电话 / 家长电话 / 毕业学校 / 起止日期 / 轮转类型 / 固定科室 / 备注
          </div>
        </div>
      </motion.div>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
          >
            <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 预览 */}
      <AnimatePresence>
        {preview.length > 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <span className="font-medium">已识别 <b className="text-emerald-700">{preview.length}</b> 条学生记录</span>
              </div>
              <span className="text-xs text-slate-500">请确认无误后点击底部「确认导入」</span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                  <tr className="text-slate-600">
                    <th className="px-3 py-2.5 text-left font-medium">班级</th>
                    <th className="px-3 py-2.5 text-left font-medium">姓名</th>
                    <th className="px-3 py-2.5 text-left font-medium">性别</th>
                    <th className="px-3 py-2.5 text-left font-medium">电话</th>
                    <th className="px-3 py-2.5 text-left font-medium">毕业学校</th>
                    <th className="px-3 py-2.5 text-left font-medium">起止</th>
                    <th className="px-3 py-2.5 text-left font-medium">类型</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => {
                    const fixedName = r.fixed_department_id
                      ? nonRotationDepts.find((d) => d.id === r.fixed_department_id)?.name
                      : null;
                    const isFixed = !!fixedName;
                    return (
                      <tr
                        key={r.id || i}
                        className={`border-t border-slate-100 transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? "bg-slate-50/30" : ""}`}
                      >
                        <td className="px-3 py-2 text-slate-700">{r.class_name}</td>
                        <td className="px-3 py-2 text-slate-900 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600">{r.gender || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600 font-mono">{r.phone || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={r.graduate_school}>
                          {r.graduate_school || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          <span className="font-mono">{r.start_date}</span>
                          <span className="mx-1 text-slate-300">→</span>
                          <span className="font-mono">{r.end_date}</span>
                        </td>
                        <td className="px-3 py-2">
                          {isFixed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              固定{fixedName ? `:${fixedName}` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                              轮转
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 操作行 */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onImport(preview)}
                disabled={importing}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.97] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {importing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    正在导入…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    确认导入 {preview.length} 人
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
