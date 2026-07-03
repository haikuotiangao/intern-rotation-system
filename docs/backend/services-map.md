# 后端 Service 方法索引

> 所有业务方法的索引，每个 Service 是 `pub struct XxxService;` + 一组 `impl` 静态方法。
>
> 详见 [`src-tauri/src/services/`](../../src-tauri/src/services/)。
>
> **最近更新：2026-07-03** — `InternService::update_allocation`、`RotationService::clean_all_and_repreallocate`、`RotationService::allocate_for_one_intern` 上线；所有 rotation mutation 路径末尾会执行 `recompute_allocation_status` 派生字段维护。

## 自动化的日志埋点

每个「写操作」Service 方法会自动写入一条 `OperationLog`，无需手动调用：

| Service 写操作 | 日志 `action_type` |
| --- | --- |
| `InternService::create` | `create_intern` |
| `InternService::update` | `update_intern`（detail 含 `fixed_changed_to_set` / `fixed_changed_to_clear`） |
| `InternService::update_allocation` | `update_intern_allocation`（新增） |
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
| `RotationService::clean_all_and_repreallocate` | `clean_all_rotation`（operator=用户） |
| `RotationService::allocate_for_one_intern` | `allocate_for_one_intern` |
| `ArchiveService::auto_archive` | `auto_archive`（operator=系统） |
| `ArchiveService::restore_from_archive` | `restore_archive` |

## 1. InternService（[`intern_service.rs`](../../src-tauri/src/services/intern_service.rs)）

```rust
pub struct InternService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `create` | `(conn, &Intern, operator) -> Result<Intern>` | 校验 start_date ≥ 今日；`fixed_department_id` 非空时 `allocation_status` 自动 `confirmed`，否则 `ready`；DAO + 日志 |
| `update` | `(conn, &Intern, operator) -> Result<Intern>` | 仅当 `start_date` 真的变化才校验过去日期；`fixed_department_id` 切换联动清理 rotation 行 + 写 `confirmed`/`ready` |
| `update_allocation` | `(conn, &str intern_id, &str allocation_status, operator) -> Result<()>` | 仅修改 `allocation_status` 单字段 + 日志 |
| `delete` | `(conn, &str id, operator) -> Result<()>` | DAO + 日志 |
| `batch_import` | `(conn, &[Intern], operator) -> Result<i32>` | 多次 insert + 强校验未来 start_date + 日志 |
| `find_all` | `(conn, Option<&str> status) -> Result<Vec<Intern>>` | 直通 DAO |
| `find_by_id` | `(conn, &str id) -> Result<Option<Intern>>` | 直通 DAO |
| `search` | `(conn, &str keyword, Option<&str>) -> Result<Vec<Intern>>` | 直通 DAO |
| `count_active` | `(conn) -> Result<i64>` | 直通 DAO |

### 业务规则（f25）

- `validate_start_date_not_past(start_date)`：实习生 `start_date` 必须 ≥ 当前系统日期。
  - 仅当 `Intern::update` 在以下情况触发：
    - 调用方传入了**与数据库旧值不同的** start_date（不是简单的「编辑了 end_date」，避免误拦历史档）
    - 否则不强制（例如只改 `duration_months`、备注）
- 默认实习时长 180 天 = 6 个月（business default，与 `intern.duration_months` 默认值一致）

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
| `pre_allocate` | `(conn) -> Result<Vec<RotationWithNames>>` | 主流程，写日志；仅含 `allocation_status='ready'` 的实习生 + 固定科室即存在 |
| `manual_adjust` | `(conn, &str assignment_id, &str new_department_id, operator) -> Result<()>` | 改科室 + recompute allocation_status + 日志 |
| `confirm_allocation` | `(conn, operator) -> Result<()>` | 全表 pre_alloc → confirmed + recompute + 日志 |
| `reset_allocation` | `(conn, operator) -> Result<Vec<RotationWithNames>>` | **仅** 删除 `pre_alloc && start_date >= 今日` 的记录（保护已确认/已开始历史） + recompute + 日志 |
| `clean_all_and_repreallocate` | `(conn, operator) -> Result<Vec<RotationWithNames>>` | r13：全表 DELETE（含 confirmed）+ 重新预分配（全量 recompute 收尾） |
| `allocate_for_one_intern` | `(conn, &str intern_id, &[(month_index, department_id)], operator) -> Result<()>` | 单个实习生按月写入；非 pre_alloc 状态行被拒绝 |
| `get_by_intern` | `(conn, &str id) -> Result<Vec<RotationWithNames>>` | 直通 DAO |
| `get_by_month` | `(conn, i32 month_index) -> Result<Vec<RotationWithNames>>` | 直通 DAO |
| `get_all_current` | `(conn) -> Result<Vec<RotationWithNames>>` | 直通 DAO |

私有辅助：
- `intern_end_date(intern) -> Option<NaiveDate>`
- `intern_personal_start(intern) -> NaiveDate`
- `intern_start_offset(intern, rotation_start) -> usize`
- `intern_rotation_months(intern, rotation_start) -> usize`
- `allocate_group(...) -> Result<()>` — 月度循环 + **5 级回退（P1-P5）**
- `proportional_assign(...) -> Vec<&DepartmentWithSystem>` — Hamilton（备用，仅 `#[allow(dead_code)]`）

### 关键算法边界（r12 → r15 累计修复）

- `rotation_start` = 当前自然月的 1 号（动态、每月重启）
- `total_capacity` 校验**只考虑 `is_rotation=true` 系统下的科室**（f22 修复）
- 5 级回退（具体见旋转分配文档）：
  - P1 = 不同系统 + 未访问 + 容量
  - P2 = 不同系统 + 未访问（允许超额）
  - P3 = 同上月系统 + 未访问
  - P4a = **仅轮转系统** 下未访问科室 + 容量
  - P5 = 任何有容量科室（允许重复）
- `reset_allocation` 仅清空 `pre_alloc && start_date >= 今日` —— 这是 r14 的策略：保护已确认/已开始档案。

## 4. ArchiveService（[`archive_service.rs`](../../src-tauri/src/services/archive_service.rs)）

```rust
pub struct ArchiveService;
```

| 方法 | 签名 | 备注 |
| --- | --- | --- |
| `auto_archive` | `(conn) -> Result<i32>` | 按 `end_date` 自动归档 + 把相关 rotation → `completed` + 日志 |
| `restore_from_archive` | `(conn, &str id, operator) -> Result<()>` | archived → active + 日志；不自动 recompute allocation_status |
| `find_archived` | `(conn) -> Result<Vec<Intern>>` | 直通 |
| `search_archived` | `(conn, &str keyword) -> Result<Vec<Intern>>` | 直通 |

> 启动期 Layout 调用 `auto_archive`，所有 archived intern 的 rotation 会升级到 `completed`，但**不会**自动改 `allocation_status`（防回归）。

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
