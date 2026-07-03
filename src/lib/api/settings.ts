import { invoke } from "@tauri-apps/api/core";
import { OperationLog } from "../../types";

export async function checkHasPassword(): Promise<boolean> {
  return invoke("check_has_password");
}

export async function verifyLogin(password: string): Promise<boolean> {
  return invoke("verify_login", { password });
}

export async function setupPassword(password: string): Promise<void> {
  return invoke("setup_password", { password });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  return invoke("change_password", { oldPassword, newPassword });
}

export async function getOperationLogs(page: number, pageSize: number, actionType?: string): Promise<OperationLog[]> {
  return invoke("get_operation_logs", { page, pageSize, actionType: actionType || null });
}

export async function getLogCount(): Promise<number> {
  return invoke("get_log_count");
}
