import { useState } from "react";
import toast from "react-hot-toast";
import { Intern } from "../../types";
import { useDepartmentSystems, useDepartments } from "../../hooks/useDepartments";

interface InternFormProps {
  initial?: Partial<Intern>;
  onSave: (intern: Partial<Intern>) => void;
  onCancel: () => void;
}

function computeEndDate(startDate: string, days: number): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

export function InternForm({ initial, onSave, onCancel }: InternFormProps) {
  const isEdit = !!initial?.id; // 编辑模式 vs 新增模式 — 新增开始日期不可变更
  const now = todayISO();
  const defaultStart = initial?.start_date || now;
  const defaultEnd = initial?.end_date || computeEndDate(defaultStart, 180);

  const [isFixed, setIsFixed] = useState(!!initial?.fixed_department_id);
  // 实习天数:作为独立 form 字段,用户在此输入 → 自动结算出结束日期
  const initialDays = initial?.start_date && initial?.end_date
    ? Math.max(1, daysBetween(initial.start_date, initial.end_date))
    : 180;
  const [form, setForm] = useState({
    class_name: initial?.class_name || "",
    name: initial?.name || "",
    gender: initial?.gender || "",
    phone: initial?.phone || "",
    parent_phone: initial?.parent_phone || "",
    graduate_school: initial?.graduate_school || "",
    remarks: initial?.remarks || "",
    duration_months: initial?.duration_months || Math.max(1, Math.round(initialDays / 30)),
    duration_days: initialDays,
    start_date: defaultStart,
    end_date: defaultEnd,
    fixed_department_id: initial?.fixed_department_id || "",
  });

  const { data: systems } = useDepartmentSystems();
  const { data: departments } = useDepartments();
  const nonRotationSystemIds = (systems ?? [])
    .filter((s) => !s.is_rotation)
    .map((s) => s.id);
  const nonRotationDepts = (departments ?? [])
    .filter((d) => nonRotationSystemIds.includes(d.system_id));

  const durationDays = form.duration_days;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.class_name || !form.name) {
      toast.error("班级与姓名为必填项");
      return;
    }
    // 业务规则:实习时长默认 180 天,最长不宜超过 365*3=1095 天
    if (durationDays > 1095) {
      toast.error("实习天数不能超过 1095 天(约 3 年)", { duration: 5000 });
      return;
    }
    onSave(isFixed ? form : { ...form, fixed_department_id: undefined });
  };

  // 双向联动:
  //   - 用户改「结束日期」 → (end - start) 自动重算 天数 + 月数
  //   - 用户改「实习天数」 → (start + days) 自动重算 结束日期 + 月数
  const setEndAndRecalc = (endDate: string) => {
    const days = Math.max(1, daysBetween(form.start_date, endDate));
    const months = Math.max(1, Math.round(days / 30));
    setForm({ ...form, end_date: endDate, duration_days: days, duration_months: months });
  };

  const setDaysAndRecalc = (days: number) => {
    const d = Math.max(1, days);
    const endDate = computeEndDate(form.start_date, d);
    const months = Math.max(1, Math.round(d / 30));
    setForm({ ...form, end_date: endDate, duration_days: d, duration_months: months });
  };

  // 开始日期 — 编辑模式可改,新增模式一次性输入后锁定不可再改
  const handleStartDatePick = (newStart: string) => {
    if (!newStart) return;
    setForm({
      ...form,
      start_date: newStart,
      duration_days: Math.max(1, form.duration_days || 180),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">班级 *</label>
          <input value={form.class_name} onChange={(e) => setForm({...form, class_name: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm" required />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">姓名 *</label>
          <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm" required />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">性别</label>
          <select value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm">
            <option value="">请选择</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">本人电话</label>
          <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">家长电话</label>
          <input value={form.parent_phone} onChange={(e) => setForm({...form, parent_phone: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">毕业学校</label>
          <input value={form.graduate_school} onChange={(e) => setForm({...form, graduate_school: e.target.value})}
            className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">
            开始日期
            {!isEdit && <span className="text-amber-600 ml-1 font-bold">(新增模式:一次性确认后不可修改)</span>}
          </label>
          <input
            type="date"
            value={form.start_date}
            readOnly={!isEdit}
            disabled={!isEdit}
            onChange={(e) => handleStartDatePick(e.target.value)}
            className={`w-full border rounded px-2 py-1.5 text-sm ${!isEdit ? "bg-slate-50 text-slate-600 cursor-not-allowed" : ""}`}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">结束日期</label>
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setEndAndRecalc(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">轮转类型</label>
          <select value={isFixed ? "fixed" : "rotation"}
            onChange={(e) => {
              const fixed = e.target.value === "fixed";
              setIsFixed(fixed);
              if (!fixed) setForm({...form, fixed_department_id: ""});
            }}
            className="w-full border rounded px-2 py-1.5 text-sm">
            <option value="rotation">轮转</option>
            <option value="fixed">固定科室</option>
          </select>
        </div>
        {isFixed && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">固定科室</label>
            <select value={form.fixed_department_id}
              onChange={(e) => setForm({...form, fixed_department_id: e.target.value})}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">请选择科室</option>
              {nonRotationDepts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">实习天数</label>
          <input
            type="number"
            min={1}
            max={1095}
            value={form.duration_days}
            onChange={(e) => setDaysAndRecalc(parseInt(e.target.value) || 180)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">≈ 实习月数</label>
          <input value={`${form.duration_months} 个月`} disabled
            className="w-full border rounded px-2 py-1.5 text-sm bg-slate-50 text-slate-600" />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">备注</label>
        <textarea value={form.remarks} onChange={(e) => setForm({...form, remarks: e.target.value})}
          className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm border rounded hover:bg-slate-50">取消</button>
        <button type="submit" className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
          {initial?.id ? "保存修改" : "添加"}
        </button>
      </div>
    </form>
  );
}
