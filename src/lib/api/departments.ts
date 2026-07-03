import { invoke } from "@tauri-apps/api/core";
import { Department, DepartmentSystem, DepartmentWithSystem } from "../../types";

export async function getDepartmentSystems(): Promise<DepartmentSystem[]> {
  return invoke("get_department_systems");
}

export async function getDepartments(): Promise<DepartmentWithSystem[]> {
  return invoke("get_departments");
}

export async function createDepartmentSystem(system: DepartmentSystem, operator: string): Promise<DepartmentSystem> {
  return invoke("create_department_system", { system, operator });
}

export async function updateDepartmentSystem(system: DepartmentSystem, operator: string): Promise<DepartmentSystem> {
  return invoke("update_department_system", { system, operator });
}

export async function deleteDepartmentSystem(id: string, operator: string): Promise<void> {
  return invoke("delete_department_system", { id, operator });
}

export async function createDepartment(department: Department, operator: string): Promise<Department> {
  return invoke("create_department", { department, operator });
}

export async function updateDepartment(department: Department, operator: string): Promise<Department> {
  return invoke("update_department", { department, operator });
}

export async function deleteDepartment(id: string, operator: string): Promise<void> {
  return invoke("delete_department", { id, operator });
}

export async function getTotalCapacity(): Promise<number> {
  return invoke("get_total_capacity");
}
