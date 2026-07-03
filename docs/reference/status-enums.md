# 状态枚举与数据库约定

> **最近更新：2026-07-03** — action_type 增到 16 种；新增 settings KV `migration_recompute_done`；interns.status 不再有 `paused`（v1.0.0 仅 active/archived）；interns.allocation_status 4 态详述。

## 1. interns.status

| 值 | 中文 | 说明 |
| --- | --- | --- |
| `active` | 实习中 | 入库或撤销归档产生 |
| `archived` | 已归档 | 由 `auto_archive` 系统产生（end_date ≤ 今日触发） |

> 早需求文档提及 `paused` 状态；v1.0.0 数据库迁移仅保留 `active`/`archived`，暂停功能未启用。如果未来要恢复，需要：
> 1. 新增 ALTER TABLE ... DEFAULT 'paused'（带 fallback）
> 2. UI 层加暂停按钮
> 3. 轮转算法在预分配时过滤掉 `status='paused'` 的实习生

## 2. rotation_assignments.status

| 值 | 中文 | 触发 | 说明 |
| --- | --- | --- | --- |
| `pre_alloc` | 预分配 | `pre_allocate_rotation` 写入 | 可调整（`manual_adjust_rotation`） |
| `confirmed` | 已确认 | `confirm_allocation` 全表 UPDATE | 锁定；`manual_adjust` 不可改 |
| `completed` | 已完成 | `auto_archive` 把已结束的 intern 的全部 rotation → `completed` | 历史 |

> 前端可视前端虚拟 `status='fixed'`（仅 `RotationOverview.tsx::getFixedDeptMonthlyRotation` 内部用，不会持久化），表示「固定科室学员本月在固定科室」。

## 2.5 interns.allocation_status（v1.0.0 派生字段）

| 取值 | 中文 | 派生条件 | 何时跳出 |
| --- | --- | --- | --- |
| `ready` | 未分配 | 0 条 rotation 行 | 至少 1 条 pre_alloc 写入后 |
| `pre_allocated` | 已预分配 | 至少 1 条 `pre_alloc` | 调用 `confirm_allocation` 且全部变 confirmed 后 |
| `confirmed` | 已确认 | 全部 `confirmed/completed` 且 `end_date >= 今日` | `end_date < 今日` 时升级到 `completed` |
| `completed` | 已完成 | 全部 `confirmed/completed` 且 `end_date < 今日` | 终态 |

`status='archived'` 时 `recompute_allocation_status` 不会覆写，保持已归档时的快照。

UI 端只读展示，不要直接 UPDATE 该字段 —— 用 `update_intern_allocation_status` 命令覆写。

## 3. operation_logs.action_type

| 类型 | 含义 | 触发 |
| --- | --- | --- |
| `create_intern` | 新增实习生 | InternService::create |
| `update_intern` | 修改实习生 | InternService::update（detail 含 `fixed_changed_to_set` / `fixed_changed_to_clear`） |
| `delete_intern` | 删除实习生 | InternService::delete |
| `batch_import` | 批量导入 | InternService::batch_import |
| `update_intern_allocation` | 覆写 `allocation_status` 字段 | InternService::update_allocation（v1.0.0 新增） |
| `create_system` / `update_system` / `delete_system` | 系统 CRUD | DepartmentService |
| `create_department` / `update_department` / `delete_department` | 科室 CRUD | DepartmentService |
| `pre_allocate` | 预分配 | RotationService::pre_allocate（operator=系统） |
| `adjust_rotation` | 调整轮转 | RotationService::manual_adjust |
| `confirm_allocation` | 确认分配 | RotationService::confirm_allocation |
| `reset_allocation` | 重置预分配 | RotationService::reset_allocation |
| `clean_all_rotation` | 清空全部轮转并重新预分配 | RotationService::clean_all_and_repreallocate（v1.0.0 新增） |
| `allocate_for_one_intern` | 单实习生预分配 | RotationService::allocate_for_one_intern（v1.0.0 新增） |
| `auto_archive` | 自动归档 | ArchiveService::auto_archive（operator=系统） |
| `restore_archive` | 撤销归档 | ArchiveService::restore_from_archive |

> 详细日志埋点对照见 [backend/services-map.md § 自动化日志埋点](../backend/services-map.md)。

> 详细日志埋点对照见 [backend/services-map.md § 自动化日志埋点](../backend/services-map.md)。

## 4. operation_logs.operator

- `"管理员"` — 用户手动触发的所有操作（前端 hard-coded）
- `"系统"` — 自动归档、自动预分配等系统行为

## 5. settings 表 KV

| key | value | 说明 |
| --- | --- | --- |
| `password_hash` | bcrypt 哈希字符串（cost=10） | 管理员密码 |
| `migration_recompute_done` | `"true"` / `"false"` | v1.0.0 启动期升级标记。设 `"true"` 后下次启动不再跑全表 `recompute_allocation_status_all` |

> 后续扩展可加：`last_rotation_start` 等。

## 6. 日期与时间约定

| 类型 | 格式 | 例子 |
| --- | --- | --- |
| 日期字符串 | `YYYY-MM-DD` | `2026-07-01` |
| 秒级时间戳 | `i64` (Unix epoch) | `1751328000` |
| 月份偏移 | `i32 month_index` (1-based) | `1` = 第 1 个月 |
| 月份键（前端） | `YYYY-MM` | `2026-07` |

## 7. ID 约定

- 客户端：`crypto.randomUUID()` — 标准 RFC 4122 v4
- 后端：`uuid::Uuid::new_v4().to_string()` — Rust 端生成的 UUID v4
- 所有数据库主键都是 TEXT 存 UUID 字符串

## 8. 数据库开关

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

> WAL 模式：读并发高，写独占，但仍可并发读
> `foreign_keys=ON`：默认每个事务级 PRAGMA，连接初始化时设置一次即可长期生效

## 9. 错误文本约定

`AppError::new(msg)` 通常以**中文短句**开头，便于前端直接显示：

| 案例 | 触发 |
| --- | --- |
| `该系统下还有科室，无法删除` | 系统删除前 |
| `该科室已有轮转记录，无法删除` | 科室删除前 |
| `没有活跃实习生。请先在「当前实习」页录入。` | pre_allocate 入参空 |
| `没有可用科室，请先添加科室` | pre_allocate 部门空 |
| `至少需要一个轮转系统` | pre_allocate 单空系统 |
| `轮转科室总容量({})小于实习生总数({})` | pre_allocate 总容量校验失败 |
| `系统「{}」下没有科室，请先添加科室` | pre_allocate 单容器空 |
| `第{}个月总容量({})不足，有{}名实习生需要轮转` | pre_allocate 月度容量失败 |
| `开始日期({})必须 ≥ 今日({})` | InternService::create/update（f25） |
| `该实习生当前状态为「{}」,非 active,无法预分配` | allocate_for_one_intern |
| `实习生 {} 第 {} 月当前状态为「{}」,已锁定,无法覆盖` | allocate_for_one_intern |
| `数据库错误: ...` | SQL 错误 |
| `未找到可在 PDF 中使用的中文字体(...)` | 字体加载失败 |
| `暂无任何「已全部确认」的实习生可供导出...` | PDF/CSV 导出护栏（r-export） |

## 10. 当前 NOT 状态

下列情形目前**没有正式 enforcement**：

- 没有"用户多角色"权限
- 没有用户级别的"我能看到哪些实习生"过滤
- 没有按 schedule 自动触发某操作（cron）
- 没有任何网络服务模块
