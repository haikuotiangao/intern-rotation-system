import { invoke } from "@tauri-apps/api/core";
import { RotationWithNames } from "../../types";

export async function preAllocateRotation(): Promise<RotationWithNames[]> {
  return invoke("pre_allocate_rotation");
}

export async function getRotationByIntern(internId: string): Promise<RotationWithNames[]> {
  return invoke("get_rotation_by_intern", { internId });
}

export async function getRotationByMonth(monthIndex: number): Promise<RotationWithNames[]> {
  return invoke("get_rotation_by_month", { monthIndex });
}

export async function getAllCurrentRotation(): Promise<RotationWithNames[]> {
  return invoke("get_all_current_rotation");
}

export async function manualAdjustRotation(assignmentId: string, newDepartmentId: string, operator: string): Promise<void> {
  return invoke("manual_adjust_rotation", { assignmentId, newDepartmentId, operator });
}

export async function confirmAllocation(operator: string): Promise<void> {
  return invoke("confirm_allocation", { operator });
}

export async function resetAllocation(operator: string): Promise<RotationWithNames[]> {
  return invoke("reset_allocation", { operator });
}

/// r13: 清空全部(含已确认)并重新预分配
export async function cleanAllAndRepreallocateRotation(operator: string): Promise<RotationWithNames[]> {
  return invoke("clean_all_and_repreallocate_rotation", { operator });
}

/// 为单个实习生批量生成预分配记录(后端自动根据 start_date+duration_months 实际生成月份)
/// allocations: 数组,每项 { department_id, month_index }。后端会以 intern 自身维度校验与写入。
export interface SingleInternAllocation {
  department_id: string;
  month_index: number;
}

export async function allocateForOneIntern(
  internId: string,
  allocations: SingleInternAllocation[],
  operator: string
): Promise<RotationWithNames[]> {
  return invoke("allocate_for_one_intern", { internId, allocations, operator });
}
