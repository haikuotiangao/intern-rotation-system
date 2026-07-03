# 更新日志

> 跟踪从最早版本到当前 v1.0.0 的所有代码 / 数据库 / 构建层面变化。
>
> **最近更新：2026-07-03** — 收录 v1.0.0 已落地的 10 类修复。

## v1.0.0 (2026-07-03 当前)

### 已落地 10 修复

| 类别 | 位置 | 改动 |
| --- | --- | --- |
| UI | 实习总览 `RotationOverview.tsx` (表头) | 姓名列宽优化、科室名"无背景纯描边"风格 |
| UI | 实习总览 `RotationOverview.tsx` (区间过滤) | `visibleInternRows` 仅展示「视图窗口内有 confirmed/completed 行」的轮转型实习生 + 实习区间与窗口重叠的固定科室实习生 |
| 前端 | `RotationOverview.tsx` | 新增 `getFixedDeptMonthlyRotation`，对固定科室实习生按月份生成虚拟轮转行 |
| 后端 | `RotationService` 5 级回退 | 把"任何有容量科室"拆为 P4a（仅轮转系统）+ P5（允许重复），f22 修复 |
| 后端 | `RotationDao::delete_all_prealloc` | 仅删 `status='pre_alloc'` 行 |
| 后端 | `RotationService::reset_allocation` | 仅清 `pre_alloc && start_date >= 今日`（r14） |
| 后端 | `RotationService::pre_allocate` | 仅作用于 `allocation_status='ready'` 实习生（保护已分配历史） |
| 后端 | `InternService` start_date 校验 (f25) | `update` 路径：只在 `start_date` 真的变化时校验过去日期 |
| 后端 | `InternService::update` fixed_department 切换(r-f22) | 切换时联动清理 rotation + 写 `confirmed`/`ready` |
| 后端 | 4 态分配状态派生 | `recompute_allocation_status` 在每个 rotation mutation 后调用；启动期一次性全表重算（`migration_recompute_done` 守卫） |
| 数据库 | `InternDao::clear_invalid_fixed_dept` | 防御性清理非法 `fixed_department_id`，防 FOREIGN KEY 失败 |
| 数据库 | 数据库迁移稳健化 | 用 `has_column` 检查 + `'true'/false'` 标记的老库升级路径（不死锁 panic） |
| 构建 | `Cargo.toml` `[profile.release]` | `lto = fat`、`codegen-units = 1`、`strip = symbols`、`opt-level = s`、`panic = abort` |
| 构建 | `report_commands.rs::load_cjk_font` | 不再 `include_bytes!` 嵌入式字体（-9.75 MB） |
| 构建 | `package.json` | 删除 `@radix-ui/*`、`react-hook-form`、`zod`、`@hookform/resolvers`、`recharts`、`dnd-kit/*`、`@react-pdf/renderer` 等冗余依赖 |
| CI | `.github/workflows/build.yml` | 新增跨平台工作流：Windows NSIS + Linux (`deb + AppImage`) |
| 前端 | `useInterns.ts::useUpdateIntern` | invalidateQueries **+ refetchQueries 双刷**；同时失效 `['intern', id]`、`['rotation-current']`、`['rotation-archived']` —— 修复详情页可见性 |
| 后端 | commands 增到 42 个 | 新增： `update_intern_allocation_status` / `clean_all_and_repreallocate_rotation` / `allocate_for_one_intern` / `open_devtools` / `export_rotation_plan_csv` / `export_department_detail_csv` |

### 安装包体积

- v1.0.0 NSIS：**约 2.65 MB**（从 11.65 MB → -77%）

## 早修复清单（在 commit log 中的简称）

| 简称 | 含义 |
| --- | --- |
| r6, r7, r10, r12, r13, r14, r15, r17 | 文档 / 代码注释中的"修复编号"。释义见 [04-rotation-algorithm.md](../04-rotation-algorithm.md) |
| r-f22 | fixed_department 切换联动，详见 [services-map.md 更新行为](../backend/services-map.md) |
| r-export | 后端 PDF/CSV 导出护栏（仅导全 confirmed 实习生） |
| f20c | 重置后端清空 rotation + recompute → ready；前端 must 同步刷 `interns` |
| f21 | `pre_allocate` 仅作用于 `allocation_status='ready'` 实习生 |
| f23, f24 | 甘特图分页 / 全部填充（最终走 f24 不分页） |
| f25 | start_date 校验仅在 update 路径上的 start_date 真的被改时触发 |
