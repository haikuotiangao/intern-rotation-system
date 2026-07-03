# 后端 DAO 方法索引

> 所有 DAO 方法的完整索引，对应文件在 [`src-tauri/src/database/dao/`](../../src-tauri/src/database/dao/)。
>
> **最近更新：2026-07-03** — `InternDao` 新增 `clear_invalid_fixed_dept` / `update_allocation_status` / `count_by_allocation_status`，`RotationDao` 顶部新增派生命 `recompute_allocation_status` / `recompute_allocation_status_all`。

> **使用约定**：所有 DAO 方法都是 `static fn`，第一参数为 `&Connection`。返回 `Result<T, AppError>`。

## 1. InternDao（[`interns.rs`](../../src-tauri/src/database/dao/interns.rs)）

```rust
pub struct InternDao;
```

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `clear_invalid_fixed_dept(conn, &mut intern) -> Result<bool>` | 防御性清理：若 `fixed_department_id` 不在 departments 表则降级为 `NULL`，返回是否修改过 |
| `insert(conn, &Intern) -> Result<()>` | 插入一条；非法 `allocation_status` 自动回落 `ready` |
| `update(conn, &Intern) -> Result<()>` | 按 id 更新（含 `allocation_status`） |
| `delete(conn, &str id) -> Result<()>` | 先删相关轮转再删实习 |
| `update_allocation_status(conn, id, status) -> Result<()>` | 仅修改 `allocation_status` 字段 |
| `find_by_id(conn, &str id) -> Result<Option<Intern>>` | 单条查找 |
| `find_all(conn, Option<&str> status) -> Result<Vec<Intern>>` | 全量，支持 status 过滤 |
| `search(conn, &str keyword, Option<&str> status) -> Result<Vec<Intern>>` | LIKE 匹配 |
| `batch_insert(conn, &[Intern]) -> Result<()>` | 多次 insert |
| `count_active(conn) -> Result<i64>` | `SELECT COUNT(*) WHERE status='active'` |
| `count_by_status(conn, &str status) -> Result<i64>` | 按 status 计数 |
| `count_by_allocation_status(conn, &str allocation_status) -> Result<i64>` | 按 `allocation_status` 计数 |

私有：`fn map_intern(row) -> rusqlite::Result<Intern>` — 行映射器。
私有：`fn load_valid_dept_ids(conn) -> Result<HashSet<String>>` — 为 `clear_invalid_fixed_dept` 服务。

## 2. DepartmentDao（[`departments.rs`](../../src-tauri/src/database/dao/departments.rs)）

```rust
pub struct DepartmentSystem { id, name, sort_order, is_rotation, rotation_interval }
pub struct Department { id, name, system_id, capacity, is_active, created_at, updated_at }
pub struct DepartmentWithSystem { id, name, system_id, system_name, capacity, is_active }
pub struct DepartmentDao;
```

### 系统相关

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `insert_system` | `fn(conn, &DepartmentSystem) -> Result<()>` | INSERT |
| `update_system` | `fn(conn, &DepartmentSystem) -> Result<()>` | UPDATE |
| `delete_system` | `fn(conn, &str id) -> Result<()>` | 若有子科室报错 |
| `find_all_systems` | `fn(conn) -> Result<Vec<DepartmentSystem>>` | ORDER BY sort_order |

### 科室相关

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `insert_department` | `fn(conn, &Department) -> Result<()>` | INSERT |
| `update_department` | `fn(conn, &Department) -> Result<()>` | UPDATE |
| `delete_department` | `fn(conn, &str id) -> Result<()>` | 若有轮转则报错 |
| `find_department_by_id` | `fn(conn, &str id) -> Result<Option<Department>>` | 单条 |
| `find_all_departments` | `fn(conn) -> Result<Vec<DepartmentWithSystem>>` | 仅 active，按系统排序 |
| `find_by_system` | `fn(conn, &str system_id) -> Result<Vec<DepartmentWithSystem>>` | 按系统筛选 |
| `get_total_capacity` | `fn(conn) -> Result<i64>` | `SUM(capacity)` 仅 active |

## 3. RotationDao（[`rotation.rs`](../../src-tauri/src/database/dao/rotation.rs)）

```rust
pub struct RotationAssignment { id, intern_id, department_id, month_index, start_date?, end_date?, status, created_at, updated_at }
pub struct RotationWithNames { /* 同上 + intern_name + intern_school + department_name + system_name */ }
pub struct RotationDao;
```

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `insert` | `fn(conn, &RotationAssignment) -> Result<()>` | 单条 INSERT |
| `insert_batch` | `fn(conn, &[RotationAssignment]) -> Result<()>` | 循环调用 insert |
| `update_status` | `fn(conn, &str id, &str status) -> Result<()>` | 改状态 |
| `update` | `fn(conn, &RotationAssignment) -> Result<()>` | 整条更新 |
| `find_by_intern` | `fn(conn, &str id) -> Result<Vec<RotationWithNames>>` | ORDER BY month_index |
| `find_by_intern_and_month` | `fn(conn, &str id, i32 month) -> Result<Option<...>>` | 单条精确查 |
| `find_all_by_month` | `fn(conn, i32 month_index) -> Result<Vec<RotationWithNames>>` | 按月查 |
| `find_all_current` | `fn(conn) -> Result<Vec<RotationWithNames>>` | 全量，按 name 排序 |
| `delete_by_intern` | `fn(conn, &str id) -> Result<()>` | 删除某实习生的全部 |
| `delete_all_prealloc` | `fn(conn) -> Result<()>` | **仅** 删除 `status='pre_alloc'` 状态行 |

### 派生命（非 impl RotationDao，独立 fn）

```rust
pub fn recompute_allocation_status(conn, &str intern_id) -> Result<(), AppError>
pub fn recompute_allocation_status_all(conn) -> Result<(), AppError>
```

派生规则（详见 [`database/schema.rs::derive_allocation_status_for_intern`](../../src-tauri/src/database/schema.rs)）：

- 0 条 rotation → `ready`
- 存在 `pre_alloc` → `pre_allocated`
- 仅 `confirmed/completed`：
  - `end_date < 今天` → `completed`
  - 否则 → `confirmed`
- `status='archived'` 不再自动派生（保护归档后生造的状态）

## 4. LogDao（[`logs.rs`](../../src-tauri/src/database/dao/logs.rs)）

```rust
pub struct OperationLog { id, operator, action_type, action_detail, created_at }
pub struct LogDao;
```

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `insert` | `fn(conn, &OperationLog) -> Result<()>` | INSERT |
| `find_all` | `fn(conn, limit, offset) -> Result<Vec<OperationLog>>` | ORDER BY created_at DESC |
| `find_by_type` | `fn(conn, &str action_type, limit, offset) -> Result<Vec<OperationLog>>` | 按类型筛选 + 分页 |
| `count` | `fn(conn) -> Result<i64>` | COUNT(*) |

## 5. SettingsDao（[`settings.rs`](../../src-tauri/src/database/dao/settings.rs)）

```rust
pub struct SettingsDao;
```

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `get` | `fn(conn, &str key) -> Result<Option<String>>` | 取值 |
| `set` | `fn(conn, &str key, &str value) -> Result<()>` | INSERT OR REPLACE |
| `get_i64` | `fn(conn, &str key, i64 default) -> Result<i64>` | 取值并解析 i64 |
| `get_bool` | `fn(conn, &str key, bool default) -> Result<bool>` | 取值并解析 bool（匹配 "true" / "1"） |

> 现存 settings 表 KV 键：`password_hash`（管理员密码 bcrypt）、`migration_recompute_done`（v1.0.0 启动期升级用），详见 [`database/schema.rs`](../../src-tauri/src/database/schema.rs)。
