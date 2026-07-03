import { useQuery, useMutation } from "@tanstack/react-query";
import * as settingsApi from "../lib/api/settings";

export function useCheckPassword() {
  return useQuery({
    queryKey: ["has-password"],
    queryFn: () => settingsApi.checkHasPassword(),
  });
}

export function useVerifyLogin() {
  return useMutation({
    mutationFn: (password: string) => settingsApi.verifyLogin(password),
  });
}

export function useSetupPassword() {
  return useMutation({
    mutationFn: (password: string) => settingsApi.setupPassword(password),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      settingsApi.changePassword(oldPassword, newPassword),
  });
}

export function useOperationLogs(page: number, pageSize: number, actionType?: string) {
  return useQuery({
    queryKey: ["operation-logs", page, pageSize, actionType],
    queryFn: () => settingsApi.getOperationLogs(page, pageSize, actionType),
  });
}

export function useLogCount() {
  return useQuery({
    queryKey: ["log-count"],
    queryFn: () => settingsApi.getLogCount(),
  });
}
