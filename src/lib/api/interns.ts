import { invoke } from "@tauri-apps/api/core";
import { Intern } from "../../types";

export async function getInterns(status?: string): Promise<Intern[]> {
  return invoke("get_interns", { status: status || null });
}

export async function getIntern(id: string): Promise<Intern | null> {
  return invoke("get_intern", { id });
}

export async function createIntern(intern: Intern, operator: string): Promise<Intern> {
  return invoke("create_intern", { intern, operator });
}

export async function updateIntern(intern: Intern, operator: string): Promise<Intern> {
  return invoke("update_intern", { intern, operator });
}

export async function deleteIntern(id: string, operator: string): Promise<void> {
  return invoke("delete_intern", { id, operator });
}

export async function searchInterns(keyword: string, status?: string): Promise<Intern[]> {
  return invoke("search_interns", { keyword, status: status || null });
}

export async function batchImportInterns(interns: Intern[], operator: string): Promise<number> {
  return invoke("batch_import_interns", { interns, operator });
}

// 更新一个实习生的 allocation_status (ready / pre_allocated / confirmed / completed)
export async function updateInternAllocationStatus(
  internId: string,
  status: string,
  operator: string
): Promise<void> {
  return invoke("update_intern_allocation_status", { internId, status, operator });
}
