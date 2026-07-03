# 07 · 业务模块详解

> 拆解每个业务流（实习生、科室、轮转、归档、报表、配置）的关键场景、前后端调用链、数据约束。
>
> **最近更新：2026-07-03** — `action_type` 增到 16 种（含 `update_intern_allocation` / `clean_all_rotation` / `allocate_for_one_intern`）；`reset_allocation` 改为「pre_alloc+未开始」过滤；`pre_allocate_rotation` 仅作用于 `allocation_status='ready'` 实习生。

## 1. 学员（实习生）模块

### 1.1 字段约束

| 字段 | 必填 | 格式 | 备注 |
| --- | --- | --- | --- |
| 班级 | ✓ | 任意文本 | 用于分类和预算 |
| 姓名 | ✓ | 任意文本 | 主键依赖 |
| 性别 |  | "男" / "女" | — |
| 本人 / 家长电话 |  | 11 位手机号建议 | 显示用 |
| 毕业学校 |  | 任意文本 | 用于报表 |
| 开始日期 | ✓ | `YYYY-MM-DD` | 缺省为今日 |
| 结束日期 |  | `YYYY-MM-DD` | 缺省按 `start_date + duration_months 个月` |
| 实习天数 |  | 整数 | 改期间自动重算月数 |
| 月数 | 输出 | `=Math.round(days / 30)` | 用于轮转计算 |
| 轮转类型 | ✓ | 枚举：轮转 / 固定 | 切换时清空 `fixed_department_id` |
| 固定科室 | 当轮转类型=固定 | 仅 `is_rotation=false` 系统下科室 | 绑死科室，所有月份都在该科室 |
| 备注 |  | 任意文本 | — |

### 1.2 状态机

```text
                          ┌──────────────────┐
         入库时 ────────────────────────→  active
                          │                  │
                          │       auto_archive
                          │ (system-level)   │
                          ▼                  ▼
                    completed ────→ archived
                          │
                  restore_archive
                          │
                          ▼
                       active
```

### 1.3 自动归档触发点

- `pages/CurrentInterns.tsx` `useEffect(() => invoke("auto_archive"), [])` 页面挂载时
- 同页面「刷新」按钮
- `components/layout/Layout.tsx` `useEffect(() => autoArchive.mutate(), [])` 全局挂载时
- `tauri::command auto_archive` 由任何前端组件按需触发

### 1.4 删除约束

`intern_commands.rs::delete_intern` → `InternDao::delete` 先 `DELETE FROM rotation_assignments WHERE intern_id=?1` 再 `DELETE FROM interns WHERE id=?1`。

### 1.5 `allocation_status` 4 态（v1.0.0 关键）

```text
  入库时默认 ready（allocation_status）
         │
         ▼
  pre_allocate_rotation（仅 ready 实习生进入）
         │
         ▼
  pre_allocated（至少 1 条 pre_alloc）
         │
         ▼
  confirm_allocation（全表 pre_alloc → confirmed）
         │
         ▼
  confirmed（全部 confirmed/completed，未结束）
         │
   end_date < 今日 时
         │
         ▼
  completed（派生自 confirmed）

  旁路（业务需求：绕过派生）：
  update_intern_allocation_status(intern_id, status, operator)
  - 仅改字段写日志，但 rotation 行不变
```

固定科室实习生（`fixed_department_id` 非空）由于不进轮转算法，初始为 `confirmed`，**不会**走 `ready → pre_allocated` 流程。

## 2. 科室 / 系统模块

### 2.1 数据模型

- `DepartmentSystem`：1 个系统归属 N 个科室
- `Department`：直接存放 `capacity`（每月容纳实习生数）
- 是否启用：`departments.is_active` 控制 UI 是否显示

### 2.2 删除约束

| 操作 | 阻塞条件 | 提示语 |
| --- | --- | --- |
| 删除系统 | 该系统下还有科室 | "该系统下还有科室，无法删除" |
| 删除科室 | 该科室已有轮转记录 | "该科室已有轮转记录，无法删除" |

### 2.3 系统颜色

由 `getSystemColor(name)` 哈希表决定 → 同一系统名 → 同一颜色，不同名尽量分散。

### 2.4 容量校验提示

科室管理页面顶部显示：

```text
总容量 Σ capacity  vs  当前实习生数 Σ active
若 < → 黄色警示条：警告预分配将失败
```

## 3. 轮转分配模块

详见 [04-rotation-algorithm.md](./04-rotation-algorithm.md)。

### 3.1 三阶段交互

```text
1. 「一键预分配」:   pre_alloc
   │
   ▼
2. 「调整」/「重置」:  student 修改 / 整体重做
   │                  （internal state）
   ▼
3. 「确认分配」:      confirmed  (locked)
```

### 3.2 字段语义

| 状态 | `pre_alloc` | `confirmed` | `completed` |
| --- | --- | --- | --- |
| 可调整 | ✓ | ✗ | ✗ |
| 可手动调整 | ✓ | ✗ | ✗ |
| 出现在矩阵中 | ✓ | ✗（除部分完成者） | ✗ |
| 自动归档时变更 | → `completed` | → `completed` | 保持 |

### 3.3 单月调整入口

- 「轮转分配」矩阵 **单元格**（仅 `pre_alloc` 状态）
- 「轮转总览」无单月调整入口；满月调整走「轮转分配」
- 「实习生详情」内未来月份可调整（即使 confirmed 状态也允许——这时会反激活为 `pre_alloc`）

> 注：第二、第三种说法以当前实现为准，实际可能略有差异。

## 4. 历史/检索模块

### 4.1 信息检索

- 输入关键字 → `search_interns(keyword)`（按 name / class_name / phone / graduate_school LIKE 匹配）
- 搜索结果包含 active + archived 两类
- 点击「查看轮转」→ 时间线视图

### 4.2 归档列表

- 仅 `status='archived'` 的实习生列表
- 顶部搜索（仅 name + class_name 实时过滤）
- 详情面板：含轮转历史、撤销归档入口

### 4.3 撤销归档

```text
1. 加载 archived intern
2. 用户修改 start_date / end_date（可选）
3. 先 update_intern 更新日期
4. 再 restore_archive 翻转 status='active'
5. 自动归档规则还在生效 → 若新 end_date <= 今日 会立即又被归档
```

## 5. 报表导出模块

### 5.1 Excel 模板生成（含说明 sheet）

```typescript
const headers = [
  "班级", "姓名", "性别", "本人电话", "家长电话",
  "毕业学校", "开始日期", "结束日期", "轮转类型", "固定科室", "备注",
];
const example = [
  "2024护理1班", "张三", "男", "13800000000", "13900000000",
  "某医学院", "2026-01-01", "2026-07-01", "轮转", "", "示例数据可删除",
];
const instructions = [
  ["字段", "是否必填", "格式说明", "示例"],
  // ...
];
```

### 5.2 4 种导出格式

| 名称 | 后端或前端 | 数据范围 |
| --- | --- | --- |
| 实习生名册 | 前端 XLSX | 当前 status 过滤 |
| 轮转计划表 | 前端 XLSX | 全部轮转矩阵 |
| 科室轮转明细 | 前端 XLSX | 全部轮转详情 |
| 进修实习通知 | 后端 Rust printpdf | 按月份 |

### 5.3 PDF 通知单

```text
总览：
1. 拉取 status IN (confirmed, pre_alloc) 的轮转
2. 按 start_date YYYY-MM 过滤月份
3. 按 (department_id, intern_school) 分组
4. 每组生成一份「进修实习通知」
5. 通知单内容：
   - 标题：进修、实习通知
   - 编号：YYYYMMxxxx
   - 收件：科室
   - 来自：单位（学校，若空则"（单位）"）
   - 正文：的 {人名} 等 {n} 人从 {start} 至 {end} 在你处实习…
   - 落款：老河口市第一医院科教科 + 当天日期
6. PDF：双份/页（A4 上下各一份）
```

## 6. 操作日志模块

### 6.1 16 种 action_type

| 类型 | 操作 | 触发 |
| --- | --- | --- |
| `create_intern` | 新增实习生 | InternService::create |
| `update_intern` | 修改实习生 | InternService::update（含 `fixed_changed_to_set` / `fixed_changed_to_clear` 标记） |
| `delete_intern` | 删除实习生 | InternService::delete |
| `batch_import` | 批量导入 | InternService::batch_import |
| `update_intern_allocation` | 覆写 `allocation_status` 字段 | InternService::update_allocation |
| `create_department` / `update_department` / `delete_department` | 科室增改删 | DepartmentService |
| `create_system` / `update_system` / `delete_system` | 系统增改删 | DepartmentService |
| `pre_allocate` | 预分配轮转（operator=系统） | RotationService::pre_allocate |
| `adjust_rotation` | 手工调整单条 | RotationService::manual_adjust |
| `confirm_allocation` | 确认分配 | RotationService::confirm_allocation |
| `reset_allocation` | 重置预分配（仅 pre_alloc+未开始） | RotationService::reset_allocation |
| `clean_all_rotation` | 清空全部轮转并重新预分配 | RotationService::clean_all_and_repreallocate |
| `allocate_for_one_intern` | 单实习生预分配 | RotationService::allocate_for_one_intern |
| `auto_archive` | 自动归档（operator=系统） | ArchiveService::auto_archive |
| `restore_archive` | 撤销归档 | ArchiveService::restore_from_archive |

详见 [reference/status-enums.md § 3](./reference/status-enums.md)。

### 6.2 操作者字段

- 用户登录态 hard-coded 为 `"管理员"`（见 App.tsx 的 loggedIn state）
- 服务端日志埋点统一使用页面传入的 `operator` 字段
- 自动归档 / 预分配日志，`operator` 为 `"系统"`

### 6.3 写入位置

- 所有 `services/*_service.rs` 中的「写操作」都额外调用 `LogDao::insert`
- 自动归档：`operator` = `"系统"`
- 用户手动操作：`operator` = `"管理员"`（前端传入）

## 7. 安全 / 配置模块

### 7.1 密码

- 初始化：首次启动 `app.rs` 启动后查询 `settings.password_hash`，若不存在，前端显示「首次使用」页 → bcrypt -> 写入
- 登录：前端输入密码，后端 `bcrypt::verify`
- 修改：旧密码校验通过后 `bcrypt::hash` 覆盖

### 7.2 前端状态

- 登录 token 仅是 `useState(true)` 的本地布尔标志
- 关闭应用 → 必须重新输入密码

## 8. 关键不变量

| 项目 | 含义 |
| --- | --- |
| 同 `(intern_id, month_index)` 唯一 | 一人一个月最多一条轮转 |
| 一份 `pre_alloc_rotation` 全表 | 每次预分配会清空所有 `status='pre_alloc'` |
| 容量约束 | 每月每科室不超过 capacity（四级回退能保证吗？） |
| 实习生状态流转 | active ↔ archived；archived 仅由系统自动产生 |
| 「无系统可轮转」错误 | 预分配时若无 `is_rotation=true` 的系统报错 |
| 「无科室可分」错误 | 全部系统容量已满 |

> 容量约束的「100% 保证」说明：算法在最坏情况下回退到 P4 「任何容量可用的科室」，并允许 `global_dept_usage` 在 P2 阶段突破 capacity，因此最终可能实际超额。交给人工在确认前手动调整。
