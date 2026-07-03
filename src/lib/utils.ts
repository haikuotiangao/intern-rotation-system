import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getEndDate(intern: { start_date: string; end_date?: string; duration_months: number }): string {
  if (intern.end_date) return intern.end_date;
  if (intern.start_date && intern.duration_months) {
    const d = new Date(intern.start_date + "T00:00:00");
    d.setMonth(d.getMonth() + intern.duration_months);
    return d.toISOString().slice(0, 10);
  }
  return "";
}

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const systemColors = [
  { name: 'slate', bg: 'bg-slate-100', text: 'text-slate-700', bar: 'bg-slate-500' },
  { name: 'gray', bg: 'bg-gray-100', text: 'text-gray-700', bar: 'bg-gray-500' },
  { name: 'zinc', bg: 'bg-zinc-100', text: 'text-zinc-700', bar: 'bg-zinc-500' },
  { name: 'stone', bg: 'bg-stone-100', text: 'text-stone-700', bar: 'bg-stone-500' },
  { name: 'red', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
  { name: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' },
  { name: 'amber', bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
  { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500' },
  { name: 'lime', bg: 'bg-lime-100', text: 'text-lime-700', bar: 'bg-lime-500' },
  { name: 'green', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' },
  { name: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  { name: 'teal', bg: 'bg-teal-100', text: 'text-teal-700', bar: 'bg-teal-500' },
  { name: 'cyan', bg: 'bg-cyan-100', text: 'text-cyan-700', bar: 'bg-cyan-500' },
  { name: 'sky', bg: 'bg-sky-100', text: 'text-sky-700', bar: 'bg-sky-500' },
  { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' },
  { name: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-700', bar: 'bg-indigo-500' },
  { name: 'violet', bg: 'bg-violet-100', text: 'text-violet-700', bar: 'bg-violet-500' },
  { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', bar: 'bg-purple-500' },
  { name: 'fuchsia', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', bar: 'bg-fuchsia-500' },
  { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', bar: 'bg-pink-500' },
  { name: 'rose', bg: 'bg-rose-100', text: 'text-rose-700', bar: 'bg-rose-500' },
];

export function getSystemColor(systemName: string) {
  let hash = 0;
  for (let i = 0; i < systemName.length; i++) {
    hash = (hash * 37 + systemName.charCodeAt(i) * (i + 1)) | 0;
  }
  const idx = Math.abs(hash) % systemColors.length;
  return systemColors[idx];
}

export function getActionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    create_intern: "新增实习生",
    update_intern: "修改实习生",
    delete_intern: "删除实习生",
    batch_import: "批量导入",
    create_department: "新增科室",
    update_department: "修改科室",
    delete_department: "删除科室",
    pre_allocate: "预分配",
    adjust_rotation: "调整轮转",
    confirm_allocation: "确认分配",
    reset_allocation: "重置分配",
    auto_archive: "自动归档",
    restore_archive: "撤销归档",
  };
  return map[type] || type;
}
