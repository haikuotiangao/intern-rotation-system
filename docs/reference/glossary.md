# 名词表（Glossary）

| 术语 | 解释 |
| --- | --- |
| **Tauri** | Rust + 前端的桌面应用框架。本项目使用 Tauri 2。 |
| **IPC** | 进程间通信。Tauri 使用 invoke 进行前后端 JSON 序列化调用。 |
| **前端** | React 18 + TypeScript + Tailwind。打包为静态 SPA，运行在 WebView 中。 |
| **后端** | Rust 主进程，负责 SQLite IO + 业务逻辑 + PDF 生成。 |
| **DAO** | Data Access Object。封装 SQL 原子操作的层。 |
| **Service** | 业务逻辑层。接收 DAO 输出，写入日志。 |
| **Command** | Tauri IPC 命令。薄壳，仅获取 state 并调用 Service。 |
| **轮转系统 (DepartmentSystem)** | 一组科室的逻辑分组（如内科系统、外科系统）。`is_rotation` 决定是否参与轮转。 |
| **轮转 / 固定** | 实习生的轮转类型。轮转者轮流入多个系统；固定者全期都在单一科室。 |
| **轮转分配 (Rotation Assignment)** | 实习生在某月应该去的科室。 |
| **预分配 (pre_alloc)** | 状态机中的初始状态，记录尚未确认。 |
| **已确认 (confirmed)** | 状态机中的提交状态，方案锁定。 |
| **已完成 (completed)** | 历史状态，由归档时回填。 |
| **自动归档 (auto_archive)** | 系统按结束日把 active → archived，并把相关轮转 → completed。 |
| **rot_start / rotation_start** | 全局轮转起点：最早实习生 start_date 所在月 1 号。 |
| **personal_start** | 某个实习生个人的轮转起点：start_date 所在月 1 号。 |
| **month_index** | 1-based 月份序号，从 rotation_start 计起。 |
| **4 级回退分配** | 轮转算法的核心策略。详见 [04-rotation-algorithm.md](../04-rotation-algorithm.md)。 |
| **MRV** | Most Restricted Variable，最受限变量优先。本项目用于实习生排序。 |
| **Hamilton 最大余数法** | 比例分配算法。本项目保留函数 `proportional_assign` 备用。 |
| **JSON 序列化** | 跨语言参数序列化约定：前端 camelCase，后端 snake_case。Tauri 自动转换。 |
| **WAL 模式** | SQLite Write-Ahead Logging，提升并发读性能。 |
| **bcrypt** | 密码哈希算法，本项目 cost = 10。 |
| **NSIS** | Windows 安装包格式。本项目 `bundle.targets = "nsis"`。 |
| **WebView** | Tauri 内嵌的 Chromium 内核。 |
| **轮转甘特图 (RotationOverview)** | 实习生 × 月份矩阵的展示页。 |
| **PDF 通知单** | 按月汇总实习生的进修 / 实习通知，A4 双份/页。 |
| **通知单编号** | `YYYYMM + 4 位序号`（如：`2026070001`）。 |
