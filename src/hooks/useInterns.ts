import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as internApi from "../lib/api/interns";
import { Intern } from "../types";

export function useInterns(status?: string) {
  const safeStatus = status ?? "all";
  return useQuery({
    queryKey: ["interns", safeStatus],
    queryFn: () => internApi.getInterns(safeStatus === "all" ? undefined : safeStatus),
  });
}

export function useIntern(id: string) {
  return useQuery({
    queryKey: ["intern", id],
    queryFn: () => internApi.getIntern(id),
    enabled: !!id,
  });
}

export function useSearchInterns() {
  return useMutation({
    mutationFn: ({ keyword, status }: { keyword: string; status?: string }) =>
      internApi.searchInterns(keyword, status),
  });
}

export function useCreateIntern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ intern, operator }: { intern: Intern; operator: string }) =>
      internApi.createIntern(intern, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
      qc.refetchQueries({ queryKey: ["interns"] });
      // start_date/end_date 改变后,allocation_status 也会被 rotation 派生路径影响,顺带刷一下
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      // update_allocation 路径只在 update 用 — 但 create 不会触发
    },
  });
}

export function useUpdateIntern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ intern, operator }: { intern: Intern; operator: string }) =>
      internApi.updateIntern(intern, operator),
    onSuccess: (_data, variables) => {
      // 先 invalidate 让所有依赖此数据的视图标记陈旧
      qc.invalidateQueries({ queryKey: ["interns"] });
      // 立刻 refetch 强制重拉,避免前端看到陈旧的 start/end 数据
      qc.refetchQueries({ queryKey: ["interns"] });
      // ★ 修复:详情页 useIntern(id) 的 queryKey 是 ["intern", id],
      //   必须在列表之外也 invalidate+refetch 单条,否则用户编辑后跳转到
      //   详情页仍会看到旧的 fixed_department_id 等字段。
      qc.invalidateQueries({ queryKey: ["intern", variables.intern.id] });
      qc.refetchQueries({ queryKey: ["intern", variables.intern.id] });
      // r-fix:fixed_department 切换会触发后端 DELETE rotation 并重置 allocation_status,
      // 前端必须立即强拉 rotation/rotation-archived,否则轮转分配页会继续显示已删除的实习生。
      qc.refetchQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["rotation-archived"] });
    },
  });
}

export function useDeleteIntern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, operator }: { id: string; operator: string }) =>
      internApi.deleteIntern(id, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
      qc.refetchQueries({ queryKey: ["interns"] });
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["rotation-archived"] });
    },
  });
}

export function useBatchImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ interns, operator }: { interns: Intern[]; operator: string }) =>
      internApi.batchImportInterns(interns, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

// 直接更新单个实习生的 allocation_status(同步字段到 rotation 流水线之外)
// 注意:rotation mutation 也会自动维护 allocation_status,所以本 hook 在 onSuccess 时
// 还要把 ["rotation-current"] 一并失效,确保相关视图立即反映新派生出来的状态。
export function useUpdateInternAllocationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      internId,
      status,
      operator,
    }: {
      internId: string;
      status: string;
      operator: string;
    }) => internApi.updateInternAllocationStatus(internId, status, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
    },
  });
}
