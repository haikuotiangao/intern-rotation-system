# 前端 Hooks 一览（React Query）

> 所有 hook 位于 [`src/hooks/`](../../src/hooks/)。

## 1. `useInterns.ts`（[`src/hooks/useInterns.ts`](../../src/hooks/useInterns.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useInterns(status?)` | Query | `['interns', safeStatus]` | `internApi.getInterns(safeStatus)` |
| `useIntern(id)` | Query | `['intern', id]` | `internApi.getIntern(id)` |
| `useSearchInterns()` | Mutation | — | `internApi.searchInterns(...)` |
| `useCreateIntern()` | Mutation | invalidate `['interns']` | `internApi.createIntern(...)` |
| `useUpdateIntern()` | Mutation | invalidate `['interns']` | `internApi.updateIntern(...)` |
| `useDeleteIntern()` | Mutation | invalidate `['interns']` | `internApi.deleteIntern(...)` |
| `useBatchImport()` | Mutation | invalidate `['interns']` | `internApi.batchImportInterns(...)` |

## 2. `useDepartments.ts`（[`src/hooks/useDepartments.ts`](../../src/hooks/useDepartments.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useDepartmentSystems()` | Query | `['department-systems']` | `deptApi.getDepartmentSystems()` |
| `useDepartments()` | Query | `['departments']` | `deptApi.getDepartments()` |
| `useCreateDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.createDepartmentSystem(...)` |
| `useUpdateDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.updateDepartmentSystem(...)` |
| `useDeleteDepartmentSystem()` | Mutation | invalidate `['department-systems']` | `deptApi.deleteDepartmentSystem(...)` |
| `useCreateDepartment()` | Mutation | invalidate `['departments']` | `deptApi.createDepartment(...)` |
| `useUpdateDepartment()` | Mutation | invalidate `['departments']` | `deptApi.updateDepartment(...)` |
| `useDeleteDepartment()` | Mutation | invalidate `['departments']` | `deptApi.deleteDepartment(...)` |
| `useTotalCapacity()` | Query | `['total-capacity']` | `deptApi.getTotalCapacity()` |

## 3. `useRotation.ts`（[`src/hooks/useRotation.ts`](../../src/hooks/useRotation.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useAllCurrentRotation()` | Query | `['rotation-current']` （refetch 重读） | `rotationApi.getAllCurrentRotation()` |
| `useRotationByIntern(id)` | Query | `['rotation-intern', id]` | `rotationApi.getRotationByIntern(id)` |
| `useRotationByMonth(monthIndex)` | Query | `['rotation-month', monthIndex]` | `rotationApi.getRotationByMonth(monthIndex)` |
| `usePreAllocate()` | Mutation | invalidate `['rotation-current']` | `rotationApi.preAllocateRotation()` |
| `useManualAdjust()` | Mutation | invalidate `['rotation-current']` | `rotationApi.manualAdjustRotation(...)` |
| `useConfirmAllocation()` | Mutation | invalidate `['rotation-current']` | `rotationApi.confirmAllocation(...)` |
| `useResetAllocation()` | Mutation | invalidate `['rotation-current']` | `rotationApi.resetAllocation(...)` |

> `useAllCurrentRotation` 配置了 `refetchOnWindowFocus: true, refetchOnMount: true, staleTime: 0`，意味着页面切换时会重新拉取，确保总览与分配页与数据库状态同步。

## 4. `useArchive.ts`（[`src/hooks/useArchive.ts`](../../src/hooks/useArchive.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useArchivedInterns()` | Query | `['interns', 'archived']` | `archiveApi.getArchivedInterns()` |
| `useAutoArchive()` | Mutation | invalidate `['interns']` | `archiveApi.autoArchive()` |
| `useRestoreArchive()` | Mutation | invalidate `['interns']` | `archiveApi.restoreArchive(...)` |

## 5. `useSettings.ts`（[`src/hooks/useSettings.ts`](../../src/hooks/useSettings.ts)）

| Hook | 类型 | Query Key | 调用方法 |
| --- | --- | --- | --- |
| `useCheckPassword()` | Query | `['has-password']` | `settingsApi.checkHasPassword()` |
| `useVerifyLogin()` | Mutation | — | `settingsApi.verifyLogin(...)` |
| `useSetupPassword()` | Mutation | — | `settingsApi.setupPassword(...)` |
| `useChangePassword()` | Mutation | — | `settingsApi.changePassword(...)` |
| `useOperationLogs(page, pageSize, actionType?)` | Query | `['operation-logs', page, pageSize, actionType]` | `settingsApi.getOperationLogs(...)` |
| `useLogCount()` | Query | `['log-count']` | `settingsApi.getLogCount()` |
