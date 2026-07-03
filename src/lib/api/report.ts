import { invoke } from "@tauri-apps/api/core";
import { Intern, RotationWithNames, DepartmentWithSystem } from "../../types";

export async function getReportInterns(status?: string): Promise<Intern[]> {
  return invoke("get_report_interns", { status: status || null });
}

export async function getReportRotationAll(): Promise<RotationWithNames[]> {
  return invoke("get_report_rotation_all");
}

export async function getReportDepartments(): Promise<DepartmentWithSystem[]> {
  return invoke("get_report_departments");
}

export async function exportRotationNoticePdf(year: number, month: number, operator: string): Promise<number[]> {
  return invoke("export_rotation_notice_pdf", { year, month, operator });
}

// 新增:r-export confirmed-only 护栏 — 后端生成 CSV 字节
export async function exportRotationPlanCsv(operator: string): Promise<number[]> {
  return invoke("export_rotation_plan_csv", { operator });
}

export async function exportDepartmentDetailCsv(operator: string): Promise<number[]> {
  return invoke("export_department_detail_csv", { operator });
}
