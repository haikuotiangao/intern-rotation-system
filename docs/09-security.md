# 09 · 安全与陷阱

> 项目中已落实的安全约束、需要注意的数据陷阱、以及变更前后的兼容性检查。
>
> **最近更新：2026-07-03** — `delete_all_prealloc` 现在**仅** 删除 `status='pre_alloc'` 行；`reset_allocation` 增加 `start_date >= 今日` 过滤；`clean_all_and_repreallocate` 提供"全表（含已确认）清空"备用路径；前端 `useUpdateIntern` 现在 invalidate + refetch 双刷（详情页可见性修复）。

## 1. 安全机制一览

| 机制 | 实现 | 备注 |
| --- | --- | --- |
| 管理员密码 | bcrypt cost 10 哈希 | 存储在 `settings.password_hash` |
| 前端路由守卫 | `useState<boolean>(false)` 登录态守卫 | 关闭应用 → 重新登录 |
| 后端外键约束 | SQLite `PRAGMA foreign_keys=ON` | 防止孤儿记录 |
| 删除保护 | 应用层校验 | 系统/科室删除前查外键 |
| 后端错误隔离 | `AppError` 统一转换 | 不暴露 SQL 错误细节 |
| CSP | `tauri.conf.json` 中 `csp: null` | 内嵌 SVG 灵活使用，但意味着放弃了浏览器 CSP 防护 |

### 1.1 已知安全局限

- **没有 token / session**：重开应用必须重输密码（这是有意简化，不是漏洞）
- **没有用户多角色**：硬编码 `operator = "管理员"`
- **CSP 关闭**：本地应用风险可控，但不要扩展到 web 场景

## 2. 数据陷阱与保护

### 2.1 删除系统

```rust
// Rust 主动检查
let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM departments WHERE system_id=?1",
    params![id], |row| row.get(0)
)?;
if count > 0 {
    return Err(AppError::new("该系统下还有科室，无法删除"));
}
```

### 2.2 删除科室

```rust
let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM rotation_assignments WHERE department_id=?1",
    params![id], |row| row.get(0)
)?;
if count > 0 {
    return Err(AppError::new("该科室已有轮转记录，无法删除"));
}
```

> 这是「软防」：已基本设计的删/改流程上限制定保护，但**操作删除系统 + 它的所有科室** 操作必须分两步完成。

### 2.3 删除实习生

`InternDao::delete` 级联清理 `rotation_assignments`：

```rust
conn.execute("DELETE FROM rotation_assignments WHERE intern_id=?1", params![id])?;
conn.execute("DELETE FROM interns WHERE id=?1", params![id])?;
```

### 2.4 自动归档竞态

- 多个 `auto_archive` 命令并发时，会重复写日志（无害，但日志会被去重）
- SQLite WAL 模式下，多读单写是安全的

## 3. 行为陷阱

### 3.1 `pre_allocate_rotation` 与 `delete_all_prealloc` 的范围

```sql
DELETE FROM rotation_assignments WHERE status='pre_alloc';
```

> 修复早期隐患：`delete_all_prealloc` 仅删除 `status='pre_alloc'` 行 —— 保护已确认的历史。
> `pre_allocate` 内部逻辑：先 `delete_all_prealloc` → 因只 impact pre_alloc，`confirmed/completed` 历史仍保留。

### 3.1.1 `reset_allocation` 的保护（r14）

```sql
DELETE FROM rotation_assignments
WHERE status='pre_alloc'
  AND (start_date IS NULL OR substr(start_date, 1, 10) >= ?1)
```

> 仅删「未确认 且 未开始」的轮转记录；保护已确认与已开始的档案。若确需清空全部（含 confirmed），请用 `clean_all_and_repreallocate_rotation` —— 二次二次确认 + 写 `clean_all_rotation` 日志。

### 3.2 容量在 P5 阶段可能超额

5 级回退 → P5：「任何有剩余容量的科室（允许重复）」仅在旋转系统内查；最坏情况仍可能出现超额。
手工调整在确认前应当再次目视检查。

P1-P5 优先级（务必保留）：
1. 不同系统 + 未访问 + 容量
2. 不同系统 + 未访问（允许超额）
3. 同上月系统 + 未访问
4. 仅轮转系统 + 未访问 + 容量（f22）：跳过 fixed 科室
5. 任何有剩余容量的科室（允许重复）

### 3.3 `month_index` 是 1-based

数据库存 `1..max_months`，不是 `0..`。
前端 `deriveMonthKey(r)` 用 `month_index - 1` 偏移计算实际自然月。

### 3.4 `intern_rotation_months` 与 `intern_start_offset`

- `intern_start_offset(intern, rotation_start) -> usize`
- `intern_rotation_months(intern, rotation_start) -> usize`

两者相加为月总数范围。
当 `intern_start_offset > 0` 时（晚到的实习生），前几个月会留空。

### 3.5 `fixed_department_id` 的双向耦合

- Intern 表的外键，可空
- 仅当系统 `is_rotation=false` 时该字段才有用
- 切换 InternForm 的轮转类型为「轮转」时，前端会显式清空 `fixed_department_id`
- **r-f22 联动**：后端 `InternService::update` 检测到 `fixed_department_id` 切换时：
  - 同步删除该实习生全部 rotation 行
  - 强制 `allocation_status = 'confirmed'`（fixed 设入）或 `'ready'`（fixed 清空）

## 4. 升级与兼容性

### 4.1 数据库迁移

`schema.rs::migrate_schema` 使用 `ALTER TABLE ADD COLUMN ... DEFAULT ...` 模式。
**新增列只能：**
- 带 default 值（避免 NOT NULL 限制）
- 命名上避免与现有冲突

### 4.2 字段重命名

不要直接重命名：先增新列、双写一段时间、再清理。

### 4.3 新增索引

```sql
CREATE INDEX IF NOT EXISTS idx_xxx ON interns(xxx);
```

`IF NOT EXISTS` 保证幂等。

## 5. 调试技巧

### 5.1 Rust 诊断输出

`commands/rotation_commands.rs` 与 `services/rotation_service.rs` 中有 `eprintln!` 输出。如要查看，启动 `cargo tauri dev` 会输出到 stderr。

### 5.2 SQLite 调试

可使用 `sqlite3` CLI 打开数据库：

```bash
sqlite3 ~/.intern-rotation/data.db
sqlite> .tables
sqlite> SELECT * FROM rotation_assignments WHERE intern_id='xxx';
```

### 5.3 前端调试

- `npm run dev` 打开 Vite 开发服务器（HTTP）
- 不走 Tauri：可通过修改启动顺序仅启动前端，便于看 console 但不能调 Tauri 命令

## 6. 跨域与 iframe

- 不允许内嵌 iframe（无相关使用场景）
- 不向外部域名发送请求（纯本地）

## 7. 已知 TODO

以下是在源码中观察到的潜在改进点：

| 位置 | 描述 |
| --- | --- |
| `scripts/` | 当前基本为空，预留给构建增强脚本 |
| 删除逻辑（已修） | `delete_all_prealloc` 现已修：仅删 `status='pre_alloc'`（见 §3.1） |
| `RotationService::reset_allocation`（已修） | 现已加 `start_date >= 今日` 过滤（见 §3.1.1） |
| `src/services/archive_service.rs` | `auto_archive` 在循环里多次调用 `update` + `update_status`，未走事务 |
| 日志表分页 | `LogService` 用 OFFSET 分页，数据量大时性能下降 |

## 8. 多窗口与窗口持久化

- 当前仅一个主窗口
- 窗口大小/位置不持久化（重启后恢复为最小尺寸）

## 9. 离线能力

- 完全离线运行
- 不向任何远端域名发起请求
- PDF 字体从 Windows 系统目录拷贝

## 10. 备份建议

| 数据 | 备份目标 |
| --- | --- |
| 数据库 | `~/.intern-rotation/data.db` |
| 升级前 | 拷贝整个 `.intern-rotation` 目录 |
| 频率 | 每个版本升级前必须备份 |

## 11. 性能与优化清单（建议）

- [ ] `auto_archive` 用单个事务包裹
- [ ] `pre_allocate` 入库改为单个事务
- [ ] `LogDao.find_by_type` 与 `find_all` 用 prepared statement cache
- [ ] 对于「轮转总览」大表渲染使用虚拟滚动
- [ ] 给 React Query 的 `defaultOptions` 加 `gcTime`

## 12. v1.0.0 累计修复（与 MEMORY 同步）

| 类别 | 修复 |
| --- | --- |
| UI | 实习总览表头布局优化（姓名列宽、科室名无背景纯描边） |
| UI | 实习总览区间过滤：`visibleInternRows` 仅展示有分配的学生 |
| 固定科室 | 每月虚拟轮转计划：`getFixedDeptMonthlyRotation` |
| 后端 | `useUpdateIntern` `invalidateQueries` 双刷修复 |
| 后端 | `delete_all_prealloc` 仅删 `status='pre_alloc'` |
| 后端 | `reset_allocation` 加 `start_date >= 今日` 过滤 |
| 后端 | `pre_allocate` 仅作用于 `allocation_status='ready'` 实习生 |
| 后端 | 4 态分配状态派生 + startup `migration_recompute_done` 一次升级 |
| 数据库 | `fixed_department_id` 切换联动清理 rotation（r-f22） |
| 数据库 | `clear_invalid_fixed_dept` 防 FOREIGN KEY 失败 |
| 构建 | 删除 PDF 嵌入字体（安装包 11.65MB → 2.65MB） |
| 构建 | Cargo release profile 调优（lto/codegen-units/strip/opt-level/panic） |
| 构建 | 删除冗余前端依赖（@radix-ui/zod/dnd-kit 等） |
| CI | GitHub Actions：targets = `nsis` + `deb` + `appimage` |
