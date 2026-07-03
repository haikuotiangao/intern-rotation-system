# 02 · 数据库设计

> SQLite 数据库的完整 schema、索引、迁移策略与默认数据。

## 1. 文件位置

- Windows：`%USERPROFILE%\.intern-rotation\data.db`
- Unix 类：`$HOME/.intern-rotation/data.db`

由 [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) 的 `get_db_path()` 计算，应用启动时自动创建目录。

## 2. PRAGMA

```sql
PRAGMA journal_mode = WAL;     -- 提升并发读性能
PRAGMA foreign_keys = ON;      -- 启用外键约束
```

## 3. 表结构

### 3.1 `department_systems` — 轮转系统

```sql
CREATE TABLE IF NOT EXISTS department_systems (
    id                  TEXT PRIMARY KEY,           -- UUID
    name                TEXT NOT NULL,              -- 系统名称（例："内科系统"）
    sort_order          INTEGER NOT NULL DEFAULT 0, -- 排序序号
    is_rotation         INTEGER NOT NULL DEFAULT 1, -- 是否参与轮转（0/1）
    rotation_interval   INTEGER NOT NULL DEFAULT 1  -- 轮转间隔（月）
);
```

**字段说明：**
- `is_rotation=1`：该系统下的科室会按月在多个系统之间循环
- `is_rotation=0`：该系统下的科室作为「固定科室」使用
- `rotation_interval`：连续在同一系统停留多少个月后切换

### 3.2 `departments` — 科室

```sql
CREATE TABLE IF NOT EXISTS departments (
    id          TEXT PRIMARY KEY,                     -- UUID
    name        TEXT NOT NULL,                        -- 科室名称
    system_id   TEXT NOT NULL,                        -- 所属系统
    capacity    INTEGER NOT NULL DEFAULT 3,           -- 月容量（实习生数）
    is_active   BOOLEAN NOT NULL DEFAULT 1,           -- 是否启用
    created_at  INTEGER NOT NULL,                     -- 秒级时间戳
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (system_id) REFERENCES department_systems(id)
);
```

### 3.3 `interns` — 实习生

```sql
CREATE TABLE IF NOT EXISTS interns (
    id                    TEXT PRIMARY KEY,
    class_name            TEXT NOT NULL,           -- 班级
    name                  TEXT NOT NULL,           -- 姓名
    gender                TEXT,                    -- 性别（男/女）
    phone                 TEXT,                    -- 本人电话
    parent_phone          TEXT,                    -- 家长电话
    graduate_school       TEXT,                    -- 毕业学校
    remarks               TEXT,                    -- 备注
    duration_months       INTEGER NOT NULL DEFAULT 6,  -- 实习时长（月）
    start_date            TEXT NOT NULL,           -- 开始日期 YYYY-MM-DD
    end_date              TEXT,                    -- 结束日期 YYYY-MM-DD
    status                TEXT NOT NULL DEFAULT 'active',  -- active / archived
    fixed_department_id   TEXT,                    -- 固定科室 ID（可空）
    allocation_status     TEXT NOT NULL DEFAULT 'ready',  -- 分配状态 (见下方)
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL,
    FOREIGN KEY (fixed_department_id) REFERENCES departments(id)
);
```

**特殊语义：**
- 当 `fixed_department_id` 非空时：该实习生不进轮转算法，固定分配到该科室的所有月份
- `end_date` 为空时，系统会使用 `start_date + duration_months 个月` 计算结束日
- `allocation_status` 是**轮转分配状态的派生/缓存字段**，由后端在 rotation mutation 路径上自动维护（详见 `src-tauri/src/database/dao/rotation.rs::recompute_allocation_status`）：
  | 取值 | 含义 | 进入条件 |
  | --- | --- | --- |
  | `ready` | 该实习生尚未生成任何 `rotation_assignments` 记录 | 新增 active intern / rotation 表中该 intern 被清空 |
  | `pre_allocated` | 已生成至少一条 `pre_alloc`，尚未确认 | 预分配成功 / 手动预分配成功 |
  | `confirmed` | 所有 rotation 均为 `confirmed`，且实习期尚未结束 | 确认分配后派生 |
  | `completed` | 所有 rotation 均为 `confirmed`/`completed`，且实习期已结束 | 派生自 `confirmed`（并在 `end_date < 今日` 时升级）|

### 3.4 `rotation_assignments` — 轮转明细

```sql
CREATE TABLE IF NOT EXISTS rotation_assignments (
    id              TEXT PRIMARY KEY,
    intern_id       TEXT NOT NULL,
    department_id   TEXT NOT NULL,
    month_index     INTEGER NOT NULL,                 -- 第几个月（1-based）
    start_date      TEXT,                             -- 该月起始日期
    end_date        TEXT,                             -- 该月结束日期
    status          TEXT NOT NULL DEFAULT 'pre_alloc',-- pre_alloc / confirmed / completed
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (intern_id) REFERENCES interns(id),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    UNIQUE (intern_id, month_index)                   -- 关键约束：每人每月唯一
);
```

**UNIQUE 约束的意义**：
- 保证每个实习生在同一个月只有一条轮转记录
- 重做预分配时会先整表 `DELETE` 再 `INSERT`，避免冲突

### 3.5 `operation_logs` — 操作审计

```sql
CREATE TABLE IF NOT EXISTS operation_logs (
    id              TEXT PRIMARY KEY,                   -- UUID
    operator        TEXT NOT NULL,                      -- 操作者
    action_type     TEXT NOT NULL,                      -- 操作类型枚举
    action_detail   TEXT NOT NULL,                      -- JSON 字符串
    created_at      INTEGER NOT NULL
);
```

**`action_type` 枚举值**：
| 类型 | 说明 |
| --- | --- |
| `create_intern` | 新增实习生 |
| `update_intern` | 修改实习生 |
| `delete_intern` | 删除实习生 |
| `batch_import` | 批量导入 |
| `create_department` | 新增科室 |
| `update_department` | 修改科室 |
| `delete_department` | 删除科室 |
| `create_system` / `update_system` / `delete_system` | 系统增改删 |
| `pre_allocate` | 预分配轮转 |
| `adjust_rotation` | 手工调整单条 |
| `confirm_allocation` | 确认分配 |
| `reset_allocation` | 重置预分配 |
| `auto_archive` / `restore_archive` | 自动归档 / 撤销归档 |

### 3.6 `settings` — KV 配置

```sql
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
```

**当前键**：
- `password_hash` — bcrypt 哈希后的管理员密码

## 4. 索引

```sql
CREATE INDEX idx_interns_status              ON interns(status);
CREATE INDEX idx_interns_class               ON interns(class_name);
CREATE INDEX idx_interns_name                ON interns(name);
CREATE INDEX idx_interns_allocation_status   ON interns(allocation_status);
CREATE INDEX idx_rotation_intern             ON rotation_assignments(intern_id);
CREATE INDEX idx_rotation_department         ON rotation_assignments(department_id);
CREATE INDEX idx_rotation_status             ON rotation_assignments(status);
CREATE INDEX idx_logs_created                ON operation_logs(created_at);
```

## 5. 迁移策略

[`src-tauri/src/database/schema.rs`](../../src-tauri/src/database/schema.rs) 中通过 `migrate_schema(conn)` 实现向后兼容：

```rust
// 幂等 ALTER TABLE，旧库无此列时再 ADD
ALTER TABLE department_systems ADD COLUMN is_rotation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE department_systems ADD COLUMN rotation_interval INTEGER NOT NULL DEFAULT 1;
ALTER TABLE interns ADD COLUMN fixed_department_id TEXT;
ALTER TABLE interns ADD COLUMN end_date TEXT;
ALTER TABLE interns ADD COLUMN allocation_status TEXT NOT NULL DEFAULT 'ready';  // r-new: 分配状态派生字段
```

`.ok()` 被故意忽略以容忍重复执行，确保升级路径平滑。

## 6. 默认数据初始化

```rust
// 仅当 department_systems 表为空时执行
INSERT INTO department_systems (id, name, sort_order)
VALUES ('uuid', '内科系统', 0),
       ('uuid', '外科系统', 1);
```

`is_rotation` 与 `rotation_interval` 取列默认值（1）。

## 7. 连接管理

```rust
// src-tauri/src/store.rs
pub struct AppState {
    pub db: Mutex<Connection>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        AppState { db: Mutex::new(db) }
    }
}
```

所有 Tauri 命令采用同一获取模式：
```rust
let conn = state.db.lock().unwrap();
// 用 &conn 调用 Service / DAO
```

## 8. 实体关系图（ERD）

```
   ┌────────────────────┐ 1..n
   │ department_systems │─────────────┐
   │ (id, name,         │             │
   │  is_rotation, ...) │             ▼
   └────────────────────┘    ┌──────────────────┐  n
                             │   departments    │─────┐
                             │ (id, name,       │     │
                             │  capacity,       │     │
                             │  system_id FK)   │     │
                             └──────────────────┘     │
                                    ▲                 │
                                    │                 │
                                    │ n               │
                             ┌──────┴───────┐         │
                             │   interns    │ n..n    │
                             │  (id, name,  │─────────┘
                             │   fixed_dept │
                             │   _id FK?    │
                             │   alloc_status: │
                             │   ready/pre_…  │
                             └──────┬───────┘
                                    │ 1
                                    │ n
                                    ▼
                             ┌────────────────────────┐
                             │ rotation_assignments   │
                             │ (id, intern_id FK,     │
                             │  department_id FK,     │
                             │  month_index,          │
                             │  UNIQUE(intern_id,     │
                             │         month_index))  │
                             └────────────────────────┘
   ┌────────────────────┐
   │ operation_logs     │ （独立审计表，与其他表无外键）
   │ settings (KV)      │ （独立 KV 表，仅 password_hash 一个键）
   └────────────────────┘
```

## 9. 关键 SQL 视图（前端的常见 Join）

### 9.1 实习生 + 轮转 + 科室 + 系统（牵涉多表 Join）

```sql
SELECT
    r.id,
    r.intern_id,
    COALESCE(i.name, '已删除'),
    i.graduate_school AS intern_school,
    r.department_id,
    COALESCE(d.name, '已删除'),
    COALESCE(ds.name, '未分类') AS system_name,
    r.month_index,
    r.start_date,
    r.end_date,
    r.status
FROM rotation_assignments r
LEFT JOIN interns            i  ON r.intern_id     = i.id
LEFT JOIN departments        d  ON r.department_id = d.id
LEFT JOIN department_systems ds ON d.system_id     = ds.id
ORDER BY COALESCE(i.name, ''), r.month_index;
```

> 使用 `LEFT JOIN + COALESCE` 的原因：实习生或科室被删除后，轮转记录里仍会出现「已删除」标记，便于审计追溯。
