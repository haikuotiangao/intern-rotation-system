import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as rotationApi from "../lib/api/rotation";

export function useAllCurrentRotation() {
  return useQuery({
    queryKey: ["rotation-current"],
    queryFn: () => rotationApi.getAllCurrentRotation(),
    refetchOnWindowFocus: false,
    // 仅在 stale 后才 refetch,避免每次进入页面或重新挂载都去拉一次后端
    refetchOnMount: false,
    staleTime: 30_000,
  });
}

export function useRotationByIntern(internId: string) {
  return useQuery({
    queryKey: ["rotation-intern", internId],
    queryFn: () => rotationApi.getRotationByIntern(internId),
    enabled: !!internId,
  });
}

export function useRotationByMonth(monthIndex: number) {
  return useQuery({
    queryKey: ["rotation-month", monthIndex],
    queryFn: () => rotationApi.getRotationByMonth(monthIndex),
  });
}

export function usePreAllocate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rotationApi.preAllocateRotation(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

export function useManualAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, newDepartmentId, operator }: { assignmentId: string; newDepartmentId: string; operator: string }) =>
      rotationApi.manualAdjustRotation(assignmentId, newDepartmentId, operator),
    onSuccess: () => {
      // 修复:在 InternDetail 页面调整后,不仅要刷新总览(rotation-current),
      // 还要刷新按实习生维度缓存的 rotation-intern 查询,否则详情页"看起来没变"。
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["rotation-intern"] });
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

export function useConfirmAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operator }: { operator: string }) =>
      rotationApi.confirmAllocation(operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

export function useResetAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operator }: { operator: string }) =>
      rotationApi.resetAllocation(operator),
    onSuccess: () => {
      // f20c:重置后端会清空 rotation 行 并 recompute interns.allocation_status 回 ready;
      // 前端必须同步刷新 interns 缓存,否则「待分配实习生」不会立即出现在矩阵
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

/// 给单个实习生批量写入预分配记录(矩阵中可见但 ready 的实习生场景)
export function useAllocateForOneIntern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      internId,
      allocations,
      operator,
    }: {
      internId: string;
      allocations: { department_id: string; month_index: number }[];
      operator: string;
    }) => rotationApi.allocateForOneIntern(internId, allocations, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotation-current"] });
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}
