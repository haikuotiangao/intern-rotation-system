import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as deptApi from "../lib/api/departments";
import { Department, DepartmentSystem } from "../types";

export function useDepartmentSystems() {
  return useQuery({
    queryKey: ["department-systems"],
    queryFn: () => deptApi.getDepartmentSystems(),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => deptApi.getDepartments(),
  });
}

export function useCreateDepartmentSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ system, operator }: { system: DepartmentSystem; operator: string }) =>
      deptApi.createDepartmentSystem(system, operator),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["department-systems"] }),
  });
}

export function useUpdateDepartmentSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ system, operator }: { system: DepartmentSystem; operator: string }) =>
      deptApi.updateDepartmentSystem(system, operator),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["department-systems"] }),
  });
}

export function useDeleteDepartmentSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, operator }: { id: string; operator: string }) =>
      deptApi.deleteDepartmentSystem(id, operator),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["department-systems"] }),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ department, operator }: { department: Department; operator: string }) =>
      deptApi.createDepartment(department, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["total-capacity"] });
      qc.invalidateQueries({ queryKey: ["department-systems"] });
    },
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ department, operator }: { department: Department; operator: string }) =>
      deptApi.updateDepartment(department, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["total-capacity"] });
      qc.invalidateQueries({ queryKey: ["department-systems"] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, operator }: { id: string; operator: string }) =>
      deptApi.deleteDepartment(id, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["total-capacity"] });
      qc.invalidateQueries({ queryKey: ["department-systems"] });
    },
  });
}

export function useTotalCapacity() {
  return useQuery({
    queryKey: ["total-capacity"],
    queryFn: () => deptApi.getTotalCapacity(),
  });
}
