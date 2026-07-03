# 前端 API 一览（Tauri invoke 封装）

> 所有 API 封装位于 [`src/lib/api/`](../../src/lib/api/)，每个文件都是模块的 `async` 函数集合。
>
> **最近更新：2026-07-03** — 新增 `rotation.allocateForOneIntern` / `cleanAllAndRepreallocateRotation` / `updateInternAllocationStatus`；新增 `report.exportRotationPlanCsv` / `exportDepartmentDetailCsv`。

调用模板：

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function xxx(/* args */): Promise<T> {
  return invoke("xxx_command", { /* snake_case 参数 */ });
}
```

> `camelCase` 参数名会被 Tauri 自动转换为 `snake_case` 后端字段名。

## 1. `interns.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `getInterns(status?)` | `get_interns` | `status?: string` | `Intern[]` |
| `getIntern(id)` | `get_intern` | `id: string` | `Intern \| null` |
| `createIntern(intern, operator)` | `create_intern` | `intern: Intern, operator: string` | `Intern` |
| `updateIntern(intern, operator)` | `update_intern` | `intern: Intern, operator: string` | `Intern` |
| `updateInternAllocationStatus(internId, status, operator)` | `update_intern_allocation_status` | `internId, status, operator` | `void` |
| `deleteIntern(id, operator)` | `delete_intern` | `id: string, operator: string` | `void` |
| `searchInterns(keyword, status?)` | `search_interns` | `keyword: string, status?: string` | `Intern[]` |
| `batchImportInterns(interns, operator)` | `batch_import_interns` | `interns: Intern[], operator: string` | `number`（已导入条数） |

## 2. `departments.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `getDepartmentSystems()` | `get_department_systems` | — | `DepartmentSystem[]` |
| `getDepartments()` | `get_departments` | — | `DepartmentWithSystem[]` |
| `createDepartmentSystem(system, operator)` | `create_department_system` | `system: DepartmentSystem, operator: string` | `DepartmentSystem` |
| `updateDepartmentSystem(system, operator)` | `update_department_system` | `system: DepartmentSystem, operator: string` | `DepartmentSystem` |
| `deleteDepartmentSystem(id, operator)` | `delete_department_system` | `id: string, operator: string` | `void` |
| `createDepartment(department, operator)` | `create_department` | `department: Department, operator: string` | `Department` |
| `updateDepartment(department, operator)` | `update_department` | `department: Department, operator: string` | `Department` |
| `deleteDepartment(id, operator)` | `delete_department` | `id: string, operator: string` | `void` |
| `getTotalCapacity()` | `get_total_capacity` | — | `number` |

## 3. `rotation.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `preAllocateRotation()` | `pre_allocate_rotation` | — | `RotationWithNames[]` |
| `getRotationByIntern(internId)` | `get_rotation_by_intern` | `internId: string` | `RotationWithNames[]` |
| `getRotationByMonth(monthIndex)` | `get_rotation_by_month` | `monthIndex: number` | `RotationWithNames[]` |
| `getAllCurrentRotation()` | `get_all_current_rotation` | — | `RotationWithNames[]` |
| `manualAdjustRotation(assignmentId, newDepartmentId, operator)` | `manual_adjust_rotation` | `assignmentId, newDepartmentId, operator` | `void` |
| `confirmAllocation(operator)` | `confirm_allocation` | `operator: string` | `void` |
| `resetAllocation(operator)` | `reset_allocation` | `operator: string` | `RotationWithNames[]` |
| `cleanAllAndRepreallocateRotation(operator)` | `clean_all_and_repreallocate_rotation` | `operator: string` | `RotationWithNames[]` |
| `allocateForOneIntern(internId, allocations, operator)` | `allocate_for_one_intern` | `internId, allocations: SingleInternAllocation[], operator` | `RotationWithNames[]` |

```typescript
// SingleInternAllocation 单个实习生预分配的输入项
export interface SingleInternAllocation {
  department_id: string;
  month_index: number; // 1-based
}
```

> r13/release 说明：`allocateForOneIntern` 用于「轮转总览」已 ready 实习生右键弹窗场景；`cleanAllAndRepreallocateRotation` 是「一键全部清空后重排」按钮，按钮触发后只剩确认/未确认历史被清，业务上的二次操作。

## 4. `archive.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `autoArchive()` | `auto_archive` | — | `number`（归档条数） |
| `restoreArchive(internId, operator)` | `restore_archive` | `internId: string, operator: string` | `void` |
| `getArchivedInterns()` | `get_archived_interns` | — | `Intern[]` |
| `searchArchivedInterns(keyword)` | `search_archived_interns` | `keyword: string` | `Intern[]` |

## 5. `settings.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `checkHasPassword()` | `check_has_password` | — | `boolean` |
| `verifyLogin(password)` | `verify_login` | `password: string` | `boolean` |
| `setupPassword(password)` | `setup_password` | `password: string` | `void` |
| `changePassword(oldPassword, newPassword)` | `change_password` | `oldPassword: string, newPassword: string` | `boolean` |
| `getOperationLogs(page, pageSize, actionType?)` | `get_operation_logs` | `page: number, pageSize: number, actionType?: string` | `OperationLog[]` |
| `getLogCount()` | `get_log_count` | — | `number` |

## 6. `report.ts`

| 函数 | 命令 | 入参 | 出参 |
| --- | --- | --- | --- |
| `getReportInterns(status?)` | `get_report_interns` | `status?: string` | `Intern[]` |
| `getReportRotationAll()` | `get_report_rotation_all` | — | `RotationWithNames[]` |
| `getReportDepartments()` | `get_report_departments` | — | `DepartmentWithSystem[]` |
| `exportRotationNoticePdf(year, month, operator)` | `export_rotation_notice_pdf` | `year: number, month: number, operator: string` | `number[]`（字节） |
| `exportRotationPlanCsv(operator)` | `export_rotation_plan_csv` | `operator: string` | `number[]`（字节） |
| `exportDepartmentDetailCsv(operator)` | `export_department_detail_csv` | `operator: string` | `number[]`（字节） |

> PDF/CSV 出口是 `number[]`（Rust 端 `Vec<u8>`），前端通过 `new Uint8Array(bytes)` 转换成字节数组后由 `writeFile` 写入磁盘。CSV 自带 UTF-8 BOM，Excel 双击亦可正常识别中文列头。
