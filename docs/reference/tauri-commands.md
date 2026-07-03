# Tauri 命令一览（共 38 个）

> 所有命令定义在 `src-tauri/src/commands/`，集中注册在 [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) `generate_handler!` 宏中。

## intern

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `get_interns` | intern_commands | `Option<String> status` | `Vec<Intern>` |
| `get_intern` | intern_commands | `String id` | `Option<Intern>` |
| `create_intern` | intern_commands | `Intern, String operator` | `Intern` |
| `update_intern` | intern_commands | `Intern, String operator` | `Intern` |
| `delete_intern` | intern_commands | `String id, String operator` | `()` |
| `search_interns` | intern_commands | `String keyword, Option<String> status` | `Vec<Intern>` |
| `batch_import_interns` | intern_commands | `Vec<Intern> interns, String operator` | `i32` |

## department

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

## rotation

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `pre_allocate_rotation` | rotation_commands | — | `Vec<RotationWithNames>` |
| `get_rotation_by_intern` | rotation_commands | `String intern_id` | `Vec<RotationWithNames>` |
| `get_rotation_by_month` | rotation_commands | `i32 month_index` | `Vec<RotationWithNames>` |
| `get_all_current_rotation` | rotation_commands | — | `Vec<RotationWithNames>` |
| `manual_adjust_rotation` | rotation_commands | `String assignment_id, String new_department_id, String operator` | `()` |
| `confirm_allocation` | rotation_commands | `String operator` | `()` |
| `reset_allocation` | rotation_commands | `String operator` | `()` |

## archive

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `auto_archive` | archive_commands | — | `i32`（归档条数） |
| `restore_archive` | archive_commands | `String intern_id, String operator` | `()` |
| `get_archived_interns` | archive_commands | — | `Vec<Intern>` |
| `search_archived_interns` | archive_commands | `String keyword` | `Vec<Intern>` |

## settings

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `check_has_password` | settings_commands | — | `bool` |
| `verify_login` | settings_commands | `String password` | `bool` |
| `setup_password` | settings_commands | `String password` | `()` |
| `change_password` | settings_commands | `String old_password, String new_password` | `bool` |
| `get_operation_logs` | settings_commands | `i64 page, i64 page_size, Option<String> action_type` | `Vec<OperationLog>` |
| `get_log_count` | settings_commands | — | `i64` |

## report

| 命名 | 模块 | 入参 | 返回 |
| --- | --- | --- | --- |
| `get_report_interns` | report_commands | `Option<String> status` | `Vec<Intern>` |
| `get_report_rotation_all` | report_commands | — | `Vec<RotationWithNames>` |
| `get_report_departments` | report_commands | — | `Vec<DepartmentWithSystem>` |
| `export_rotation_notice_pdf` | report_commands | `i32 year, u32 month, String operator` | `Vec<u8>` |

## 设计模式

- 所有命令第一参数 `state: State<'_, AppState>`；其余业务参数通过 IPC 接收
- `let conn = state.db.lock().unwrap();` 是标准开头
- Service 调用通过同步函数实现，不阻塞 UI（IPC 默认是异步，前端不需要 await Service；但 Tauri Command 调 Service 是在 main thread 中）
- `State<AppState>` 通过 `tauri::Builder::manage(app_state)` 注入
