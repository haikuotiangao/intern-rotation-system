import { invoke } from "@tauri-apps/api/core";
import { Intern } from "../../types";

export async function autoArchive(): Promise<number> {
  return invoke("auto_archive");
}

export async function restoreArchive(internId: string, operator: string): Promise<void> {
  return invoke("restore_archive", { internId, operator });
}

export async function getArchivedInterns(): Promise<Intern[]> {
  return invoke("get_archived_interns");
}

export async function searchArchivedInterns(keyword: string): Promise<Intern[]> {
  return invoke("search_archived_interns", { keyword });
}
