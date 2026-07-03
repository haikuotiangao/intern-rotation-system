# Tauri 命令一览（共 42 个）

> 所有命令定义在 `src-tauri/src/commands/`，集中注册在 [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) `generate_handler!` 宏中。
>
> **最近更新：2026-07-03** — 在 v1.0.0 基线上新增 4 个 IPC 命令以支持 4 态分配状态机、总览区段开关、PDF/CSV 导出扩展。命令数从 38 → 42。

## intern（8 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `get_interns` | intern_commands | `Option<String> status` | `Vec<Intern>` |
| `get_intern` | intern_commands | `String id` | `Option<Intern>` |
| `create_intern` | intern_commands | `Intern, String operator` | `Intern` |
| `update_intern` | intern_commands | `Intern, String operator` | `Intern` |
| `update_intern_allocation_status` | intern_commands | `String intern_id, String allocation_status, String operator` | `()` |
| `delete_intern` | intern_commands | `String id, String operator` | `()` |
| `search_interns` | intern_commands | `String keyword, Option<String> status` | `Vec<Intern>` |
| `batch_import_interns` | intern_commands | `Vec<Intern> interns, String operator` | `i32` |

## department（9 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `get_department_systems` | department_commands | — | `Vec<DepartmentSystem>` |
| `get_departments` | department_commands | — | `Vec<DepartmentWithSystem>` |
| `create_department_system` | department_commands | `DepartmentSystem, String operator` | `DepartmentSystem` |
| `update_department_system` | department_commands | `DepartmentSystem, String operator` | `DepartmentSystem` |
| `delete_department_system` | department_commands | `String id, String operator` | `()` |
| `create_department` | department_commands | `Department, String operator` | `Department` |
| `update_department` | department_commands | `Department, String operator` | `Department` |
| `delete_department` | department_commands | `String id, String operator` | `()` |
| `get_total_capacity` | department_commands | — | `i64` |

## rotation（9 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `pre_allocate_rotation` | rotation_commands | — | `Vec<RotationWithNames>` |
| `get_rotation_by_intern` | rotation_commands | `String intern_id` | `Vec<RotationWithNames>` |
| `get_rotation_by_month` | rotation_commands | `i32 month_index` | `Vec<RotationWithNames>` |
| `get_all_current_rotation` | rotation_commands | — | `Vec<RotationWithNames>` |
| `manual_adjust_rotation` | rotation_commands | `String assignment_id, String new_department_id, String operator` | `()` |
| `confirm_allocation` | rotation_commands | `String operator` | `()` |
| `reset_allocation` | rotation_commands | `String operator` | `Vec<RotationWithNames>` |
| `clean_all_and_repreallocate_rotation` | rotation_commands | `String operator` | `Vec<RotationWithNames>` |
| `allocate_for_one_intern` | rotation_commands | `String intern_id, Vec<AllocationInput> allocations, String operator` | `Vec<RotationWithNames>` |

> `AllocationInput` 结构体（`rotation_commands.rs` 末尾定义）：
> ```rust
> #[derive(serde::Deserialize)]
> struct AllocationInput { department_id: String, month_index: i32 }
> ```

## archive（4 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `auto_archive` | archive_commands | — | `i32`（归档条数） |
| `restore_archive` | archive_commands | `String intern_id, String operator` | `()` |
| `get_archived_interns` | archive_commands | — | `Vec<Intern>` |
| `search_archived_interns` | archive_commands | `String keyword` | `Vec<Intern>` |

## settings（6 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `check_has_password` | settings_commands | — | `bool` |
| `verify_login` | settings_commands | `String password` | `bool` |
| `setup_password` | settings_commands | `String password` | `()` |
| `change_password` | settings_commands | `String old_password, String new_password` | `bool` |
| `get_operation_logs` | settings_commands | `i64 page, i64 page_size, Option<String> action_type` | `Vec<OperationLog>` |
| `get_log_count` | settings_commands | — | `i64` |

## report（6 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `get_report_interns` | report_commands | `Option<String> status` | `Vec<Intern>` |
| `get_report_rotation_all` | report_commands | — | `Vec<RotationWithNames>` |
| `get_report_departments` | report_commands | — | `Vec<DepartmentWithSystem>` |
| `export_rotation_notice_pdf` | report_commands | `i32 year, u32 month, String operator` | `Vec<u8>` |
| `export_rotation_plan_csv` | report_commands | `String operator` | `Vec<u8>`（磁盘 CSV 内容字节） |
| `export_department_detail_csv` | report_commands | `String operator` | `Vec<u8>` |

## devtools（1 个）

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `open_devtools` | devtools_command | — | `Result<(), String>` |

> 调试辅助：在前端通过 `invoke("open_devtools")` 唤起 F12。`tauri.conf.json` 已开启 `devtools: true`，生产构建中仍然能手动打开。

## 设计模式

- 所有命令第一参数 `state: State<'_, AppState>`；其余业务参数通过 IPC 接收
- `let conn = state.db.lock().unwrap();` 是标准开头
- Service 调用通过同步函数实现，不阻塞 UI（IPC 默认是异步，前端不需要 await Service；但 Tauri Command 调 Service 是在 main thread 中）
- `State<AppState>` 通过 `tauri::Builder::manage(app_state)` 注入
- `devtools` 与 `report` 类的写入命令也走 IPC，但不发到 React Query —— 它们是面向调试/导出场景

## 2026-07-03 修复

| 命令 | 改动 |
| --- | --- |
| `update_intern_allocation_status` | 新增。允许前端直接覆写单一字段，绕过 rotation 流水的自动派生 |
| `clean_all_and_repreallocate_rotation` | 新增。r13：清空**全部**轮转记录（含已确认）后重新预分配 |
| `allocate_for_one_intern` | 新增。r-fix：为单个实习生按月份写入预分配记录 |
| `open_devtools` | 新增。调试时主动打开 WebView DevTools |
| `export_rotation_plan_csv` / `export_department_detail_csv` | 新增。后端生成 CSV（confirmed-only 过滤），不依赖前端 xlsx |
