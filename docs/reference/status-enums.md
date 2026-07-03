# 状态枚举与数据库约定

## 1. interns.status

| 值 | 中文 | 说明 |
| --- | --- | --- |
| `active` | 实习中 | 由入库或撤销归档产生 |
| `archived` | 已归档 | 由 `auto_archive` 系统产生 |

## 2. rotation_assignments.status

| 值 | 中文 | 触发 | 说明 |
| --- | --- | --- | --- |
| `pre_alloc` | 预分配 | `pre_allocate_rotation` 写入 | 可调整 |
| `confirmed` | 已确认 | `confirm_allocation` 全表 UPDATE | 锁定 |
| `completed` | 已完成 | `auto_archive` 修改 | 历史 |

## 3. operation_logs.action_type

| 类型 | 含义 |
| --- | --- |
| `create_intern` | 新增实习生 |
| `update_intern` | 修改实习生 |
| `delete_intern` | 删除实习生 |
| `batch_import` | 批量导入 |
| `create_system` / `update_system` / `delete_system` | 系统 CRUD |
| `create_department` / `update_department` / `delete_department` | 科室 CRUD |
| `pre_allocate` | 预分配（operator=系统） |
| `adjust_rotation` | 调整轮转 |
| `confirm_allocation` | 确认分配 |
| `reset_allocation` | 重置预分配 |
| `auto_archive` | 自动归档（operator=系统） |
| `restore_archive` | 撤销归档 |

> 详细日志埋点对照见 [backend/services-map.md § 自动化日志埋点](../backend/services-map.md)。

## 4. operation_logs.operator

- `"管理员"` — 用户手动触发的所有操作（前端 hard-coded）
- `"系统"` — 自动归档、自动预分配等系统行为

## 5. settings 表 KV

| key | value | 说明 |
| --- | --- | --- |
| `password_hash` | bcrypt 哈希字符串 | 管理员密码 |

> 当前仅此一个键。后续扩展可加：`last_rotation_start`、`system_overrides` 等。

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
| `没有当前实习的实习生` | pre_allocate 入参空 |
| `没有可用科室，请先添加科室` | pre_allocate 部门空 |
| `至少需要一个轮转系统` | pre_allocate 单空系统 |
| 第 X 个月总容量不足 | pre_allocate 月度容量失败 |
| 系统名 下没有科室 | pre_allocate 单容器空 |
| 数据库错误: ... | SQL 错误 |
| `未找到支持中文的字体文件` | PDF 时无可用中文字体 |

## 10. 当前 NOT 状态

下列情形目前**没有正式 enforcement**：

- 没有"用户多角色"权限
- 没有用户级别的"我能看到哪些实习生"过滤
- 没有按 schedule 自动触发某操作（cron）
- 没有任何网络服务模块
