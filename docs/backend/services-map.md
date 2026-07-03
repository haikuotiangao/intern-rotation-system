# 后端 Service 方法索引

> 所有业务方法的索引，每个 Service 是 `pub struct XxxService;` + 一组 `impl` 静态方法。
>
> 详见 [`src-tauri/src/services/`](../../src-tauri/src/services/)。

## 自动化的日志埋点

每个「写操作」Service 方法会自动写入一条 `OperationLog`，无需手动调用：

| Service 写操作 | 日志 `action_type` |
| --- | --- |
| `InternService::create` | `create_intern` |
| `InternService::update` | `update_intern` |
| `InternService::delete` | `delete_intern` |
| `InternService::batch_import` | `batch_import` |
| `DepartmentService::create_system` | `create_system` |
| `DepartmentService::update_system` | `update_system` |
| `DepartmentService::delete_system` | `delete_system` |
| `DepartmentService::create_department` | `create_department` |
| `DepartmentService::update_department` | `update_department` |
| `DepartmentService::delete_department` | `delete_department` |
| `RotationService::pre_allocate` | `pre_allocate`（operator=系统） |
| `RotationService::manual_adjust` | `adjust_rotation` |
| `RotationService::confirm_allocation` | `confirm_allocation` |
| `RotationService::reset_allocation` | `reset_allocation` |
| `ArchiveService::auto_archive` | `auto_archive`（operator=系统） |
| `ArchiveService::restore_from_archive` | `restore_archive` |

## 1. InternService（[`intern_service.rs`](../../src-tauri/src/services/intern_service.rs)）

```rust
pub struct InternService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `create` | `(conn, &Intern, operator) -> Result<Intern>` | INSERT + 日志 |
| `update` | `(conn, &Intern, operator) -> Result<Intern>` | UPDATE + 日志 |
| `delete` | `(conn, &str id, operator) -> Result<()>` | DAO + 日志 |
| `batch_import` | `(conn, &[Intern], operator) -> Result<i32>` | 多次 insert + 日志 |
| `find_all` | `(conn, Option<&str> status) -> Result<Vec<Intern>>` | 直通 DAO |
| `find_by_id` | `(conn, &str id) -> Result<Option<Intern>>` | 直通 DAO |
| `search` | `(conn, &str keyword, Option<&str>) -> Result<Vec<Intern>>` | 直通 DAO |
| `count_active` | `(conn) -> Result<i64>` | 直通 DAO |

## 2. DepartmentService（[`department_service.rs`](../../src-tauri/src/services/department_service.rs)）

```rust
pub struct DepartmentService;
```

### 系统
| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `create_system` | `(conn, &DepartmentSystem, operator) -> Result<DepartmentSystem>` | INSERT + 日志 |
| `update_system` | `(conn, &DepartmentSystem, operator) -> Result<DepartmentSystem>` | UPDATE + 日志 |
| `delete_system` | `(conn, &str id, operator) -> Result<()>` | DAO + 日志 |
| `find_all_systems` | `(conn) -> Result<Vec<DepartmentSystem>>` | 直通 |

### 科室
| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `create_department` | `(conn, &Department, operator) -> Result<Department>` | INSERT + 日志 |
| `update_department` | `(conn, &Department, operator) -> Result<Department>` | UPDATE + 日志 |
| `delete_department` | `(conn, &str id, operator) -> Result<()>` | DAO + 日志 |
| `find_all_departments` | `(conn) -> Result<Vec<DepartmentWithSystem>>` | 直通 |
| `find_by_system` | `(conn, &str system_id) -> Result<Vec<DepartmentWithSystem>>` | 直通 |
| `get_total_capacity` | `(conn) -> Result<i64>` | 直通 |

## 3. RotationService（[`rotation_service.rs`](../../src-tauri/src/services/rotation_service.rs)）

> 最核心的 Service，详见 [04-rotation-algorithm.md](../04-rotation-algorithm.md)。

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `pre_allocate` | `(conn) -> Result<Vec<RotationWithNames>>` | 主流程，写日志 |
| `manual_adjust` | `(conn, &str assignment_id, &str new_department_id, operator) -> Result<()>` | 改科室 + 日志 |
| `confirm_allocation` | `(conn, operator) -> Result<()>` | 全表 pre_alloc → confirmed + 日志 |
| `reset_allocation` | `(conn, operator) -> Result<()>` | 清空预分配 + 日志 |
| `get_by_intern` | `(conn, &str id) -> Result<Vec<RotationWithNames>>` | 直通 DAO |
| `get_by_month` | `(conn, i32 month_index) -> Result<Vec<RotationWithNames>>` | 直通 DAO |
| `get_all_current` | `(conn) -> Result<Vec<RotationWithNames>>` | 直通 DAO |

私有辅助：
- `intern_end_date(intern) -> Option<NaiveDate>`
- `intern_personal_start(intern) -> NaiveDate`
- `intern_start_offset(intern, rotation_start) -> usize`
- `intern_rotation_months(intern, rotation_start) -> usize`
- `allocate_group(...) -> Result<()>` — 月度循环 + 4 级回退
- `proportional_assign(...) -> Vec<&DepartmentWithSystem>` — Hamilton（备用）

## 4. ArchiveService（[`archive_service.rs`](../../src-tauri/src/services/archive_service.rs)）

```rust
pub struct ArchiveService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `auto_archive` | `(conn) -> Result<i32>` | 按 `end_date` 自动归档 + 日志 |
| `restore_from_archive` | `(conn, &str id, operator) -> Result<()>` | archived → active + 日志 |
| `find_archived` | `(conn) -> Result<Vec<Intern>>` | 直通 |
| `search_archived` | `(conn, &str keyword) -> Result<Vec<Intern>>` | 直通 |

## 5. SettingsService（[`settings_service.rs`](../../src-tauri/src/services/settings_service.rs)）

```rust
pub struct SettingsService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `verify_password` | `(conn, &str input) -> Result<bool>` | bcrypt::verify |
| `set_password` | `(conn, &str password) -> Result<()>` | bcrypt::hash(cost=10) | settings 表写入 |
| `has_password` | `(conn) -> Result<bool>` | key 是否存在 |

## 6. LogService（[`log_service.rs`](../../src-tauri/src/services/log_service.rs)）

```rust
pub struct LogService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `get_logs` | `(conn, page, page_size, Option<&str> action_type) -> Result<Vec<OperationLog>>` | 直通 DAO |
| `get_log_count` | `(conn) -> Result<i64>` | 直通 |
