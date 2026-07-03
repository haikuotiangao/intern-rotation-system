import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as archiveApi from "../lib/api/archive";

export function useArchivedInterns() {
  return useQuery({
    queryKey: ["interns", "archived"],
    queryFn: () => archiveApi.getArchivedInterns(),
  });
}

export function useAutoArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveApi.autoArchive(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}

export function useRestoreArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ internId, operator }: { internId: string; operator: string }) =>
      archiveApi.restoreArchive(internId, operator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interns"] });
    },
  });
}
