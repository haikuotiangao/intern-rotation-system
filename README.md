# 实习生管理系统（Intern Rotation System）

> 面向医院/医疗机构场景的桌面应用程序，用于管理实习生科室轮转的全生命周期流程。

## 项目速览

| 项目属性 | 值 |
| --- | --- |
| 项目名称 | 实习生管理系统 (Intern Rotation System) |
| 版本 | v1.1.0 |
| 应用标识符 | `com.intern-rotation.system` |
| 主技术栈 | **Tauri 2 + Rust + React 18 + TypeScript + Tailwind CSS + SQLite** |
| 适用平台 | Windows 10/11 (NSIS 安装包) · Linux x86_64 / arm64 (.deb + AppImage) |
| 输出产物 | 跨平台自动发布（GitHub Releases）：Windows `.exe` / Linux `.deb` / Linux `.AppImage` |
| 用户定位 | 老河口市第一医院（科教科 / 信息科） |
| 文档目录 | `docs/` |

## 安装包下载（v1.1.0+）

所有平台的安装包都通过 GitHub Actions 跨平台构建，每个 tag 自动发布。**请按你机器的实际架构挑选下面对应资产**：

| 平台 | 架构 | 安装包 | 典型场景 |
| --- | --- | --- | --- |
| Windows | x86_64 | `*_Windows_x86_64.exe` | 普通 Win 10/11 PC |
| Windows | arm64 | `*_Windows_arm64.exe` | Surface Pro X / WoA |
| Linux | x86_64 | `*_Linux_x86_64.deb` 或 `.AppImage` | Intel/AMD Linux |
| Linux | arm64 | `*_Linux_arm64.deb` 或 `.AppImage` | 龙芯 / 飞腾 / 树莓派 等 ARM Linux |

→ 下载链接：[**GitHub Releases › v1.1.0**](https://github.com/haikuotiangao/intern-rotation-system/releases/tag/v1.1.0)

### Linux 安装指引

- **Debian / Ubuntu** 系统：选 `.deb` 包，`sudo apt install ./xxx.deb`，自动处理依赖。
- **Arch / Manjaro** 系统：**推荐用 AppImage**（自带 webkit 运行时，不依赖系统包）：
  ```bash
  # 安装运行所需基础库
  sudo pacman -S --needed fuse2 libappindicator-gtk3 librsvg2

  # 下载 + 运行
  wget https://github.com/haikuotiangao/intern-rotation-system/releases/download/v1.1.0/_v1.1.0_Linux_arm64.AppImage
  chmod +x _v1.1.0_Linux_arm64.AppImage
  ./_v1.1.0_Linux_arm64.AppImage
  ```
- Tauri 应用运行需要 `libwebkit2gtk-4.1-0` 与 `libgtk-3-0`，AppImage 自带不依赖系统；用 `.deb` 时 distro 仓库缺这俩 webkit 包会出现 "依赖关系不满足：libwebkit2gtk-4.1-0"。


## 核心价值

- **减少手工排班**：自动按"轮转系统 + 科室容量"按月分配实习生
- **完整生命周期**：从入科登记 → 自动归档 → 历史检索全流程覆盖
- **可视化呈现**：Excel 模板导入导出、PDF 进修通知单、轮转甘特图
- **本地化部署**：SQLite 本地数据库、bcrypt 密码保护、无外部依赖

## 文档导航

| 文档 | 说明 |
| --- | --- |
| [README.md](./README.md) | 本文件：项目速览、文档导航 |
| [01-architecture.md](./01-architecture.md) | 系统架构、技术栈、目录结构、数据流 |
| [02-database.md](./02-database.md) | 数据库设计、SQL 建表语句、索引、迁移 |
| [03-backend.md](./03-backend.md) | Rust 后端分层、Tauri 命令、DAO / Service 解析 |
| [04-rotation-algorithm.md](./04-rotation-algorithm.md) | 核心轮转分配算法的实现细节 |
| [05-frontend.md](./05-frontend.md) | React 前端模块、路由、状态管理、UI 规范 |
| [06-frontend-pages.md](./06-frontend-pages.md) | 各页面职责、关键交互、API 调用 |
| [07-business-modules.md](./07-business-modules.md) | 班级管理、实习生、轮转、归档、报表各业务模块 |
| [08-build-and-deployment.md](./08-build-and-deployment.md) | 开发命令、生产构建、安装包输出 |
| [09-security.md](./09-security.md) | 权限模型、安全约束与操作陷阱 |

### 后端专题（仅在维护后端时查阅）

- [backend/dao-map.md](./backend/dao-map.md) — 所有 DAO 方法的索引
- [backend/services-map.md](./backend/services-map-map.md) — Service 业务逻辑索引

### 前端专题（仅在维护前端时查阅）

- [frontend/hooks-reference.md](./frontend/hooks-reference.md) — React Query hook 一览
- [frontend/api-reference.md](./frontend/api-reference.md) — Tauri invoke 调用封装

### 参考

- [reference/tauri-commands.md](./reference/tauri-commands.md) — 全部 38 个 Tauri 命令清单
- [reference/status-enums.md](./reference/status-enums.md) — 状态枚举与数据库约定
- [reference/glossary.md](./reference/glossary.md) — 名词表

## 一句话总结

本系统是一个**单用户、纯本地、医院专用**的轮转排班 + 实习生档案 + 通知单生成工具，核心创新点在 Rust 端的**四级回退 + MRV 启发式轮转算法**。
