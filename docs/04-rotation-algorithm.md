# 04 · 轮转分配核心算法

> 本项目最重要的业务逻辑，位于 [`src-tauri/src/services/rotation_service.rs`](../../src-tauri/src/services/rotation_service.rs)，共 ~450 行。
>
> 维护者必读。任何修改前请完整阅读 `pre_allocate` 与 `allocate_group` 的源码。

## 1. 目标

把一组「实习生 + 起止时间 + 轮转/固定类型」在月份维度上映射到一组「科室」上，满足：

- **容量约束**：每月每个科室不超过 `capacity`
- **正交轮转**：非固定实习生优先在不同系统之间切换
- **避免重复**：尽量避免同一人被连续分配到同一科室

## 2. 类型速览

```rust
pub struct Intern {
    pub id: String,
    pub start_date: String,                  // "YYYY-MM-DD"
    pub end_date: Option<String>,
    pub duration_months: i32,                // 兜底时长
    pub fixed_department_id: Option<String>  // 标记「固定科室」实习生
    // ...
}

pub struct DepartmentSystem {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub is_rotation: bool,                   // 该系统是否参与轮转
}

pub struct DepartmentWithSystem {
    pub id: String,
    pub name: String,
    pub system_id: String,
    pub capacity: i32,
    // ...
}

pub struct RotationAssignment {
    pub id: String,
    pub intern_id: String,
    pub department_id: String,
    pub month_index: i32,                    // 1-based
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: String,                      // "pre_alloc" 等
    // 审计字段
}
```

## 3. `pre_allocate` 主流程

```text
                         ┌──────────────────────────────────┐
                         │ 1. 收集所有 active interns        │
                         │    过滤过期（end_date > today）    │
                         └─────────────┬────────────────────┘
                                       ▼
                         ┌──────────────────────────────────┐
                         │ 2. 加载 active systems + depts    │
                         │    校验至少有一个轮转系统          │
                         └─────────────┬────────────────────┘
                                       ▼
                         ┌──────────────────────────────────┐
                         │ 3. 计算 rotation_start            │
                         │   = 最早 StartDate 所在月的 1 号   │
                         └─────────────┬────────────────────┘
                                       ▼
                         ┌──────────────────────────────────┐
                         │ 4. 校验 Σ(capacity) >= 实习生数   │
                         └─────────────┬────────────────────┘
                                       ▼
                         ┌──────────────────────────────────┐
                         │ 5. delete_all_prealloc            │
                         │    DELETE FROM rotation_assignments│
                         └─────────────┬────────────────────┘
                                       ▼
              ┌────────────────────────┴────────────────────────┐
              ▼                                                 ▼
┌──────────────────────────────────┐         ┌─────────────────────────────────┐
│ 6. 固定科室组                      │         │ 7. 轮转组 allocate_group          │
│    直接生成「每月到同一科室」的记录 │         │    MRV 排序 + 4 级回退分配         │
└──────────────┬───────────────────┘         └─────────────┬─────────────────────┘
               └────────────────────────┬─────────────────┘
                                        ▼
                          ┌─────────────────────────┐
                          │ 8. insert_batch          │
                          │    INSERT INTO ...       │
                          └─────────────┬────────────┘
                                        ▼
                          ┌─────────────────────────┐
                          │ 9. 写入 pre_allocate 日志 │
                          └─────────────────────────┘
```

## 4. 关键辅助函数

### 4.1 `intern_end_date(intern) -> Option<NaiveDate>`

```rust
match &intern.end_date {
    Some(ed) => NaiveDate::parse_from_str(ed, "%Y-%m-%d").ok(),
    None => {
        let s = NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d").ok()?;
        Some(s + Months::new(intern.duration_months as u32))
    }
}
```

### 4.2 `intern_personal_start(intern) -> NaiveDate`

实习生的「个人轮转起始月」= start_date 所在月的 1 号。

### 4.3 `intern_start_offset(intern, rotation_start) -> usize`

个人相对全局起始月的偏移。若个人起始 ≤ 全局起始则返回 0。

### 4.4 `intern_rotation_months(intern, rotation_start) -> usize`

实际轮转月数 = `(end_date 所在月 - max(personal_start, rotation_start)) + 1`，最小 1。

> 这两个函数决定每个实习生在矩阵中要占据哪些列。

## 5. 固定科室组（6.）

直接按个人月起止填充每个月：

```rust
for m in offset..(offset + total_months) {
    let ms = rotation_start + Months::new(m as u32);
    let next_month = rotation_start + Months::new((m + 1) as u32);
    let me = next_month.pred_opt().unwrap_or(next_month);

    let actual_start = if m == offset {
        intern_start.map(|s| max(s, ms)).unwrap_or(ms)
    } else { ms };

    let actual_end = if m == offset + total_months - 1 {
        intern_end.unwrap_or(me)
    } else { me };

    assignments.push(RotationAssignment { ... });
}
```

`actual_start` / `actual_end` 处理「迟到入职」与「提前结束」的截断。

## 6. 轮转组（7.）：`allocate_group`

### 6.1 初始化

```rust
let max_months = interns.iter()
    .map(|i| offset(i) + total(i))
    .max().unwrap_or(6);

// 每个系统的总容量 = 该系统下所有科室容量之和
let sys_capacities: Vec<usize> = systems.iter().map(|s| {
    departments.iter()
        .filter(|d| d.system_id == s.id)
        .map(|d| d.capacity as usize).sum()
}).collect();

// 实习生的系统历史（首月前为空）
let mut intern_system_history: HashMap<String, Vec<usize>> = HashMap::new();

// 实习生已分配过的科室（首月前为空）
let mut last_department: HashMap<String, Vec<String>> = HashMap::new();
```

### 6.2 每月循环

```text
for m in 0..max_months
  ├─ 取本月应参与的实习生集合
  │   filter: m >= offset && m < offset + total
  ├─ 若本月无人 → continue
  ├─ 统计 total_cap = Σ sys_capacities
  │   校验 total_cap >= 本月实习生数
  ├─ 拷贝"已分配科室表"作为 visited
  ├─ 拷贝"全局科室用量"统计
  │
  ├─ **MRV 排序**：实习生按"剩余未访问科室数"升序
  │     （最受限者优先分配）
  │
  └─ 顺序为每人挑一个（sys, dept）
       4 级回退 ---
```

### 6.3 MRV 排序（最受限变量优先）

```rust
let mut sorted_interns: Vec<&&Intern> = month_interns.iter().collect();
sorted_interns.sort_by_key(|i| {
    let visited = pre_dept.get(&i.id).map(|v| v.as_slice()).unwrap_or(&[]);
    rotation_departments.iter()
        .filter(|d| !visited.contains(&d.id))
        .count()
});
```

**为什么这样**：
- 已被安排到 4 个科室的实习生还剩 1 个未访问科室 → 排第一
- 还有 5 个未访问的实习生 → 排后面
- 先给选项最少的安排，能避免后期「无科室可分」

### 6.4 四级回退分配（核心）

对每个实习生按以下顺序挑选 `(系统, 科室)` 对：

#### Priority 1 — 不同系统 + 未访问 + 剩余容量

```rust
for sys_idx in 0..n_systems {
    if assigned_counts[sys_idx] >= sys_capacities[sys_idx] { continue; }
    if Some(sys_idx) == last_month_sys { continue; }
    for dept in dept_by_sys[sys_idx] {
        if visited.contains(&dept.id) { continue; }
        if dept_used(dept) >= dept.capacity { continue; }
        return Some((sys_idx, dept));
    }
}
```

#### Priority 2 — 不同系统 + 未访问（允许超额）

> 如果 P1 找不到（非当月人数超过系统聚合），尝试不校验科室容量，只保证跨系统 + 未访问。

#### Priority 3 — 同上月系统 + 未访问

> 当多系统容量已用尽，回退到同上月系统，至少保证此前分配进度不被打乱。

#### Priority 4 — 任何有剩余容量的科室（允许重复）

> 终极兜底。即使重复，依然能找到可用位置。

### 6.5 写入逻辑

每选出一个 `(sys, dept)`：

```rust
monthly.push((intern, sys_idx));
assigned_counts[sys_idx] += 1;
*global_dept_usage.entry(dept.id.clone()).or_insert(0) += 1;
intern_system_history.entry(intern.id).or_default().push(sys_idx);

// 写入 assignments 列表（同固定科室组的截断逻辑）
assignments.push(RotationAssignment { ... });
last_department.entry(intern.id).or_default().push(dept.id.clone());
```

## 7. 状态与锁

| 状态 | 触发 | 是否可改 |
| --- | --- | --- |
| `pre_alloc` | `pre_allocate_rotation` 写入 | 是 |
| `confirmed` | `confirm_allocation` 全表 `UPDATE ... WHERE status='pre_alloc'` | 否（设计为不可改） |
| `completed` | `auto_archive` 修改 | 否 |

`manual_adjust` 仍把状态改回 `pre_alloc`（只在 `pre_alloc` 阶段可手动调整）。

## 8. `manual_adjust` 的作用

```rust
pub fn manual_adjust(
    conn: &Connection,
    assignment_id: &str,
    new_department_id: &str,
    operator: &str,
)
```

- 对单条记录直接 `UPDATE department_id`
- 状态恢复为 `pre_alloc`
- 写一条 `adjust_rotation` 日志

适用场景：
- 「轮转分配」矩阵中点击单元格出现调整 modal
- 「实习生详情」页调整单月科室

## 9. 操作日志

`pre_allocate` 末尾统一写一条日志：

```rust
LogDao::insert(conn, &OperationLog {
    id: uuid::Uuid::new_v4().to_string(),
    operator: "系统".to_string(),
    action_type: "pre_allocate".to_string(),
    action_detail: format!(
        "预分配完成，共{}名实习生（{}条记录），起始日{}",
        interns.len(), all_assignments.len(),
        rotation_start.format("%Y-%m-%d")
    ),
    created_at: chrono::Utc::now().timestamp(),
})?;
```

## 10. UI 联动与回退算法的影响

| UI 展示 | 含义 |
| --- | --- |
| 表格单元格颜色 | 按 `system_name` 哈希到调色板 |
| 同一实习生不同月份用不同颜色 | 表示已切换轮转系统 |
| 颜色相同的相邻月 | 表示仍停留在同系统 |
| 单元格显示科室名 | 直接来自 `department_name` |

调整窗口里：先选目标系统、再列同系统科室，避免一次性跨系统跳跃。

## 11. 性能与可扩展性

| 实习生数 | 月份数 | 实测耗时 | 备注 |
| --- | --- | --- | --- |
| 10 | 12 | < 10ms | 普通医院实习生规模 |
| 50 | 24 | < 50ms | 略大规模 |
| 200+ | 36 | 数百毫秒 | 算法当前仍是 O(月 × 人 × 系统 × 科室) |

**算法当前不并发**，但在 Mutex 锁定下调用足够快。如果未来要支撑 1000+ 人，建议迁移到 OR-tools / CP-SAT 求解器。

## 12. 修改算法的 Checklist

1. 修改前先 `cargo test`（建议加一个简单样本数据集测试）
2. 保持 `month_index` 语义不变（1-based）
3. 保持 `assignment.start_date / end_date` 在「个人月起止」内截断
4. 修改 `assignments.push` 后必须：
   - 更新 `last_department`（是否访问过该科室）
   - 更新 `intern_system_history`（本月落在哪个系统）
   - 更新 `global_dept_usage`（本科室占用加 1）
5. 增加日志埋点，不要漏掉 `OperationLog`
6. UI 层甘特图 / 矩阵表与算法字段强耦合，**改字段时同时更新**：
   - `RotationService::get_all_current` 的 sql
   - 前端 `[src/types.ts](../../src/types.ts)` 的 `RotationWithNames`
7. 不要并行访问共享结构（`intern_system_history` / `last_department`），它们都是普通 `HashMap`

## 13. 进阶：可选的「Hamilton 最大余数法」`proportional_assign`

文件中保留了一个未在主流程调用的 `proportional_assign` 函数，使用 Hamilton 最大余数法做比例分配——把科室当作槽位、总人数 × 容量匹配 → 输出科室序列。可用于未来的「按比例分配到非轮转系统」场景。
