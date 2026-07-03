# 前端 Hooks 一览（React Query）

> 所有 hook 位于 [`src/hooks/`](../../src/hooks/)。
>
> **最近更新：2026-07-03** — `useUpdateIntern` 已统一使用 `invalidateQueries + refetchQueries` 双刷，列举 `useUpdateInternAllocationStatus`、`useAllocateForOneIntern` 两条新增 hook。

## 1. `useInterns.ts`（[`src/hooks/useInterns.ts`](../../src/hooks/useInterns.ts)）

| Hook | 类型 | Query Key | 调用方法 | 备注 |
| --- | --- | --- | --- | --- |
| `useInterns(status?)` | Query | `['interns', safeStatus]` | `internApi.getInterns(safeStatus)` | `safeStatus` 默认 `"all"` |
| `useIntern(id)` | Query | `['intern', id]` | `internApi.getIntern(id)` | |
| `useSearchInterns()` | Mutation | — | `internApi.searchInterns(...)` | |
| `useCreateIntern()` | Mutation | invalidate + refetch `['interns']`；invalidate `['rotation-current']` | `internApi.createIntern(...)` | 双刷新增/历史 |
| `useUpdateIntern()` | Mutation | 见「2026-07-03 修复」 | `internApi.updateIntern(...)` | 同时刷 `['intern', id]`、`['rotation-current']`、`['rotation-archived']` |
| `useUpdateInternAllocationStatus()` | Mutation | invalidate `['interns']`、`['rotation-current']` | `internApi.updateInternAllocationStatus(...)` | 新增 |
| `useDeleteIntern()` | Mutation | invalidate + refetch `['interns']`；invalidate `['rotation-current']`、`['rotation-archived']` | `internApi.deleteIntern(...)` | |
| `useBatchImport()` | Mutation | invalidate `['interns']` | `internApi.batchImportInterns(...)` | |

### 2026-07-03 修复：useUpdateIntern 双 invalidate

旧实现只 `invalidateQueries`，导致 `useIntern(id)` 单条查询缓存没即时刷新。**新实现强制 invalidate + refetch 双刷所有被这条 mutation 影响的 cache key**：

```typescript
onSuccess: (_data, variables) => {
  qc.invalidateQueries({ queryKey: ["interns"] });
  qc.refetchQueries({ queryKey: ["interns"] });
  // ★ 详情页 useIntern(id) 的 queryKey 是 ["intern", id]
  qc.invalidateQueries({ queryKey: ["intern", variables.intern.id] });
  qc.refetchQueries({ queryKey: ["intern", variables.intern.id] });
  // r-fix:fixed_department 切换会触发后端 DELETE rotation + recompute allocation_status
  qc.refetchQueries({ queryKey: ["rotation-current"] });
  qc.invalidateQueries({ queryKey: ["rotation-current"] });
  qc.invalidateQueries({ queryKey: ["rotation-archived"] });
},
```

## 2. `useDepartments.ts`（[`src/hooks/useDepartments.ts`](../../src/hooks/useDepartments.ts)）

| Hook | 类型 | Query Key | 调用方法 | 备注 |
| --- | --- | --- | --- | --- |
| `useDepartmentSystems()` | Query | `['department-systems']` | `deptApi.getDepartmentSystems()` | |
| `useDepartments()` | Query | `['departments']` | `deptApi.getDepartments()` | |
| `useCreateDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.createDepartmentSystem(...)` | |
| `useUpdateDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.updateDepartmentSystem(...)` | |
| `useDeleteDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.deleteDepartmentSystem(...)` | |
| `useCreateDepartment()` | Mutation | invalidate `['departments']`、`['total-capacity']`、`['department-systems']` | `deptApi.createDepartment(...)` | |
| `useUpdateDepartment()` | Mutation | 同上 | `deptApi.updateDepartment(...)` | |
| `useDeleteDepartment()` | Mutation | 同上 | `deptApi.deleteDepartment(...)` | |
| `useTotalCapacity()` | Query | `['total-capacity']` | `deptApi.getTotalCapacity()` | |

## 3. `useRotation.ts`（[`src/hooks/useRotation.ts`](../../src/hooks/useRotation.ts)）

| Hook | 类型 | Query Key | 调用方法 | 备注 |
| --- | --- | --- | --- | --- |
| `useAllCurrentRotation()` | Query | `['rotation-current']` | `rotationApi.getAllCurrentRotation()` | `staleTime: 30_000`、`refetchOnMount: false`、`refetchOnWindowFocus: false` |
| `useRotationByIntern(id)` | Query | `['rotation-intern', id]` | `rotationApi.getRotationByIntern(id)` | |
| `useRotationByMonth(monthIndex)` | Query | `['rotation-month', monthIndex]` | `rotationApi.getRotationByMonth(monthIndex)` | |
| `usePreAllocate()` | Mutation | invalidate `['rotation-current']`、`['interns']` | `rotationApi.preAllocateRotation()` | |
| `useManualAdjust()` | Mutation | invalidate `['rotation-current']`、`['rotation-intern']`、`['interns']` | `rotationApi.manualAdjustRotation(...)` | |
| `useConfirmAllocation()` | Mutation | invalidate `['rotation-current']`、`['interns']` | `rotationApi.confirmAllocation(...)` | |
| `useResetAllocation()` | Mutation | invalidate `['rotation-current']`、`['interns']` | `rotationApi.resetAllocation(...)` | |
| `useAllocateForOneIntern()` | Mutation | invalidate `['rotation-current']`、`['interns']` | `rotationApi.allocateForOneIntern(...)` | 新增 |

> `useAllCurrentRotation` 配置 `staleTime: 30s, refetchOnMount: false, refetchOnWindowFocus: false` —— 多次进入页面不会重复拉取，节约 IPC。手动 `usePreAllocate` 等 mutation 显式 invalidate。

## 4. `useArchive.ts`（[`src/hooks/useArchive.ts`](../../src/hooks/useArchive.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useArchivedInterns()` | Query | `['interns', 'archived']` | `archiveApi.getArchivedInterns()` |
| `useAutoArchive()` | Mutation | invalidate `['interns']` | `archiveApi.autoArchive()` |
| `useRestoreArchive()` | Mutation | invalidate `['interns']` | `archiveApi.restoreArchive(...)` |

> 前端在 `Layout.tsx` 全局挂载时调用 `autoArchive.mutate()`，并在当前实习页挂载时再拉一次 `autoArchive`。

## 5. `useSettings.ts`（[`src/hooks/useSettings.ts`](../../src/hooks/useSettings.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useCheckPassword()` | Query | `['has-password']` | `settingsApi.checkHasPassword()` |
| `useVerifyLogin()` | Mutation | — | `settingsApi.verifyLogin(...)` |
| `useSetupPassword()` | Mutation | — | `settingsApi.setupPassword(...)` |
| `useChangePassword()` | Mutation | — | `settingsApi.changePassword(...)` |
| `useOperationLogs(page, pageSize, actionType?)` | Query | `['operation-logs', page, pageSize, actionType]` | `settingsApi.getOperationLogs(...)` |
| `useLogCount()` | Query | `['log-count']` | `settingsApi.getLogCount()` |
