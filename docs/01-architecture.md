# 01 · 系统架构

> 介绍项目的整体分层、技术栈选型，以及关键的数据流向。
>
> **最近更新：2026-07-03** — 反映 v1.0.0 当前状态：精简后的 release profile、Cargo.toml 真实依赖、context 中实际命令数为 42、PDF/CSV 双轨导出。

## 1. 整体分层

```
┌─────────────────────────────────────────────────────────────────┐
│           Presentation Layer (React)                            │
│   Pages │ Components │ Hooks │ Layout (Sidebar + Header)        │
├─────────────────────────────────────────────────────────────────┤
│           Tauri IPC Bridge (@tauri-apps/api)                    │
│              invoke("command_name", { ...args })                │
├─────────────────────────────────────────────────────────────────┤
│           Application Layer (Rust Commands)                     │
│   commands/{intern, department, rotation, archive, settings,    │
│             report}                                             │
├─────────────────────────────────────────────────────────────────┤
│           Service Layer (Business Logic)                        │
│   services/{intern, department, rotation, archive, settings,    │
│             log}_service                                        │
├─────────────────────────────────────────────────────────────────┤
│           Data Access Layer (DAO)                               │
│   database/dao/{interns, departments, rotation, logs, settings} │
├─────────────────────────────────────────────────────────────────┤
│           Persistence Layer                                     │
│        SQLite Database (~/.intern-rotation/data.db)             │
└─────────────────────────────────────────────────────────────────┘
```

**调用方向自上而下，数据返回自下而上**。所有跨层数据交换均通过 serde 序列化（前端 ↔ 后端）。

## 2. 技术栈

### 2.1 后端（Cargo.toml 真实依赖）

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `tauri` | 2（`features=["devtools"]`） | 桌面应用框架（IPC、窗口管理、bundle） |
| `tauri-plugin-dialog` | 2 | 文件保存对话框 |
| `tauri-plugin-fs` | 2 | 文件系统读写 |
| `serde` / `serde_json` | 1 | 前后端 JSON 参数序列化 |
| `rusqlite` | 0.31（`bundled`） | SQLite 嵌入式数据库（无需外部依赖） |
| `uuid` | 1（`v4`） | 主键 ID 生成 |
| `chrono` | 0.4（`serde`） | 日期时间处理 |
| `bcrypt` | 0.15 | 管理员密码哈希 |
| `tokio` | 1（`full`） | tauri 2 runtime 需要 |
| `printpdf` | 0.4 | PDF 通知单生成 |
| `rusttype` | 0.9 | 字体宽度解析（PDF r12 单位修正） |

> `tauri-plugin-shell` / `process` / `updater` 已从 v1.0.0 中**移除**（之前预留但未注册），代码更轻量。

`[profile.release]` 关键字段（v1.0.0 精简版）：
```toml
lto = "fat"
codegen-units = 1
strip = "symbols"
opt-level = "s"
panic = "abort"
```

### 2.2 前端（package.json 实际依赖）

| 类别 | 包 |
| --- | --- |
| **核心框架** | react@18, react-dom@18, react-router-dom@6 |
| **构建工具** | vite@5, typescript@5, @vitejs/plugin-react@4 |
| **样式方案** | tailwindcss@3, postcss, autoprefixer |
| **数据状态** | @tanstack/react-query@5 |
| **UI 基础组件** | lucide-react（图标），clsx + tailwind-merge + tailwindcss-animate |
| **交互动画** | framer-motion@11, react-hot-toast |
| **表格 / Excel** | xlsx@0.18（仅前端 Excel 模板下载，PDF/CSV 主路径走 Rust） |
| **桌面桥** | @tauri-apps/api@2, @tauri-apps/plugin-dialog/fs |

> v1.0.0 移除了：`@radix-ui/*`、`react-hook-form`、`zod`、`@hookform/resolvers`、`recharts`、`dnd-kit/*`、`@react-pdf/renderer`。

## 3. 目录结构

### 3.1 顶层目录

```
intern-rotation-system/
├── docs/                       # 项目文档（本目录）
├── src/                        # React 前端源码
├── src-tauri/                  # Tauri + Rust 后端源码
├── public/                     # 静态资源
├── scripts/                    # 构建 / 工具脚本
├── dist/                       # Vite 构建产物
├── output/                     # Tauri NSIS 安装包输出
├── node_modules/               # npm 依赖（git 忽略）
├── index.html                  # HTML 入口
├── package.json                # npm 元数据
├── vite.config.ts              # Vite 配置（端口 1420）
├── tsconfig.json / tsconfig.node.json
├── tailwind.config.js          # 自定义金色主题
├── postcss.config.js
├── tauri.conf.json             # Tauri 应用配置
├── PROJECT.md                  # 原始 PROJECT.md（开发记录，不动）
└── 实习生轮转管理系统-需求文档.md  # 原始需求文档（历史档案）
```

### 3.2 前端 `src/`

```
src/
├── main.tsx                    # React 入口（StrictMode + createRoot）
├── App.tsx                     # 顶层组件：登录守卫 + QueryClient + Router
├── index.css                   # Tailwind 入口 + 中文字体 + 自定义样式
├── types.ts                    # 全部 TS 类型定义（与 Rust struct 一一对应）
├── hooks/                      # React Query 数据层封装
│   ├── useInterns.ts           # 实习生 CRUD
│   ├── useDepartments.ts       # 科室 / 系统 CRUD
│   ├── useRotation.ts          # 轮转分配 / 调整 / 确认
│   ├── useArchive.ts           # 归档 / 恢复
│   └── useSettings.ts          # 密码 / 日志
├── lib/
│   ├── api/                    # 薄封装 Tauri invoke 调用
│   │   ├── interns.ts · departments.ts · rotation.ts
│   │   ├── archive.ts · settings.ts · report.ts
│   ├── query/client.ts         # QueryClient 实例（staleTime: 30s）
│   ├── reports/                # 报表生成辅助（预留）
│   └── utils.ts                # cn()、日期格式化、系统配色、操作类型枚举
├── components/                 # 通用 UI 组件层
│   ├── layout/{Layout,Sidebar}.tsx
│   ├── ui/Modal.tsx
│   ├── interns/{InternForm,InternImport}.tsx
│   └── settings/Login.tsx
└── pages/                      # 路由页面（每个对应一个 Route）
    ├── CurrentInterns.tsx       # 当前实习（首页）
    ├── ArchivedInterns.tsx      # 归档列表 + 撤销归档
    ├── DepartmentMgmt.tsx       # 科室管理
    ├── RotationAllocation.tsx   # 轮转分配（矩阵表 + 调整）
    ├── RotationOverview.tsx     # 轮转总览（甘特图）
    ├── InternDetailPage.tsx     # 实习生详情 + 轮转计划
    ├── HistorySearch.tsx        # 信息检索（时间线）
    ├── Reports.tsx              # 报表导出（PDF / Excel）
    ├── OperationLogs.tsx        # 操作日志
    └── Settings.tsx             # 修改密码
```

### 3.3 后端 `src-tauri/src/`

```
src-tauri/src/
├── main.rs                     # 由 tauri-build 自动生成
├── lib.rs                      # **入口**：模块声明 + Tauri Builder + 命令注册
├── error.rs                    # AppError 统一类型
├── store.rs                    # AppState（Mutex<Connection>）
├── database/
│   ├── mod.rs
│   ├── schema.rs               # SQLite 建表 + 迁移 + 默认数据
│   └── dao/
│       ├── mod.rs · interns.rs · departments.rs · rotation.rs
│       └── logs.rs · settings.rs
├── services/                   # 业务逻辑层（核心算法所在地）
│   ├── mod.rs · intern_service.rs · department_service.rs
│   ├── rotation_service.rs     # 核心：pre_allocate 算法（450+ 行）
│   ├── archive_service.rs · settings_service.rs · log_service.rs
└── commands/                   # Tauri 命令暴露层（共 42 个 IPC;7 个模块）
    ├── mod.rs · intern_commands.rs (8) · department_commands.rs (9)
    ├── rotation_commands.rs (9，含 AllocationInput 入参结构)
    ├── archive_commands.rs (4) · settings_commands.rs (6)
    ├── report_commands.rs (6，PDF + 2 个 CSV)      # 含 PDF + CSV 生成
    └── devtools_command.rs (1)
```

## 4. 关键数据流

### 4.1 创建实习生（典型全栈调用链）

```
React (CurrentInterns.tsx)
  └─ handleSave() ─→ createIntern.mutate({ intern, operator })     [hook]
                       │
                       ▼
                       internApi.createIntern(intern, operator)     [api 薄封装]
                       └─ invoke("create_intern", { intern, operator })   [IPC]
                       │
                       ▼ Tauri IPC
Rust (commands/intern_commands.rs::create_intern)
  └─ lock(state.db) → InternService::create(&conn, &intern, &operator)
                       │
                       ▼
Rust (services/intern_service.rs::create)
  ├─ InternDao::insert()                                            [INSERT INTO interns ...]
  └─ LogDao::insert(OperationLog { action_type="create_intern",     [INSERT INTO operation_logs ...]
                                   action_detail={"name":..., "class":...} })
        ▼
SQLite (~/.intern-rotation/data.db)
        ▲
        │ onSuccess → qc.invalidateQueries(['interns'])
React Query 自动刷新依赖该 key 的所有组件
```

### 4.2 一键预分配（重操作）

```
React (RotationAllocation.tsx)
  └─ handlePreAllocate() → preAllocate.mutate()
                              │
                              ▼ invoke("pre_allocate_rotation")
Rust (commands/rotation_commands.rs::pre_allocate_rotation)
  └─ RotationService::pre_allocate(&conn)
        ├── 1. 拉取所有 active interns，过滤已过期
        ├── 2. 加载 system + department 全量
        ├── 3. 计算 rotation_start = 最早实习生 start_date 所在月 1 号
        ├── 4. 校验 Σ(department.capacity) >= interns.len()
        ├── 5. RotationDao::delete_all_prealloc()                   [清旧]
        ├── 6. 生成固定科室组（fixed_department_id 非空）
        ├── 7. allocate_group(rotation_interns, ...)                [核心算法]
        │       └── 对每月执行 MRV 排序 + 4 级回退分配
        ├── 8. RotationDao::insert_batch()                          [批量插入]
        └── 9. LogDao::insert(action_type="pre_allocate", ...)      [写日志]
   Result → Vec<RotationWithNames> → 前端 React Query 失效 → 重新查询
```

### 4.3 PDF 导出

```
React (Reports.tsx)
  └─ exportPdf() → invoke("export_rotation_notice_pdf",
                            { year, month, operator })        [后端生成]
                       │
                       ▼
Rust (commands/report_commands.rs::export_rotation_notice_pdf)
  └─ 拉取所有 confirmed + pre_alloc 记录，过滤月份，分组，排序，编号
      └─ render_notice_pdf() → printpdf::PdfDocument 输出 Vec<u8>
                       │
                       ▲
                       ▼
React：const bytes = await invoke(...)
       const fp = await save({ filters: [{...pdf}] })        [Tauri dialog]
       await writeFile(fp, new Uint8Array(bytes))            [Tauri fs]
```

## 5. 通信约定

### 5.1 前后端参数

- 所有 Tauri 命令的参数命名遵循 `camelCase`（前端）→ `snake_case`（后端）的自动转换（Tauri 默认）
- 错误返回统一为 `AppError { message: String }`，前端可直接 `toast.error(e.message)`

### 5.2 时间戳

- 数据库存两种时间：
  - **日期字符串**：`YYYY-MM-DD`（如 `start_date`, `end_date`）
  - **秒级时间戳**：`i64`（如 `created_at`, `updated_at`），前端用 `Math.floor(Date.now() / 1000)` 生成

### 5.3 ID

- 客户端：`crypto.randomUUID()`（浏览器原生）
- 后端：`uuid::Uuid::new_v4().to_string()`

## 6. 部署拓扑

```
┌──────────────────────────────────┐
│          用户桌面（Windows）      │
│  ┌─────────────────────────────┐ │
│  │  Tauri WebView (Chromium)   │ │
│  │  └─ React SPA              │ │
│  │     └─ @tauri-apps/api     │ │
│  └─────────────────────────────┘ │
│            ↕ IPC                │
│  ┌─────────────────────────────┐ │
│  │  Rust 主进程                │ │
│  │  └─ Tauri 2 Runtime        │ │
│  │     ├─ sqlite (rusqlite)   │ │
│  │     └─ ~/.intern-rotation/ │ │
│  └─────────────────────────────┘ │
│            ↕                    │
│  ┌─────────────────────────────┐ │
│  │  SQLite (.db 文件, 本地)   │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘
```

无外部依赖、无服务端、单机部署。
