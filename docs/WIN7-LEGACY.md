# Win7 兼容分支（feat/win7-legacy）

> 注意：此分支设计用于为 **Windows 7 SP1** 提供一个能跑的实习生管理系统构建产物。
>
> **不要再在本分支上跑 Tauri 2、Tauri 3 或基于 WebView2 的任何技术栈。** 它们在 Win7 上 100% 不可用 —— Microsoft 已停止为 Win7 发布 WebView2 Runtime，连带 Edge 引擎也没有 Win7 SDK。

## 当前 main 分支是什么

- 框架：Tauri 2 + Rust + React 18
- 产物：v1.1.0 → GitHub Releases 含 Win x86_64 / Win arm64 / Linux x86_64 / Linux arm64 共 6 资产
- 兼容 OS：**Windows 10/11 / Server 2016+、Linux x86_64 / arm64**

## 本分支目标

为 **Win7 SP1 (x86_64)** 打造单独的"legacy"发布流。这个分支与 main 不同步，最终会发布到独立的 tag（如 `v1.0.0-legacy7`），不影响主版本节奏。

## 技术候选

| 候选 | 是否可行 | 备注 |
| --- | --- | --- |
| **Tauri 1** | ⚠️ 不稳定 | Tauri 1 默认用系统 WebView2，没有就 fail。我们没法改 runtime，但理论上可改走 `WRY_WEBVIEW=ie` 这种 hack，Win7 上的 IE11 不够 |
| **Electron 22.x** | ✅ 可行 | Electron 22（最后支持 Win7 SP1），自带 Chromium，**已无安全更新，不建议生产** |
| **NW.js 0.66+** | ✅ 可行 | 类似 Electron，社区支持度低 |
| **.NET Framework 4.8 WPF** | ✅ 可行 | Win7 SP1 + .NET 4.8 仍受官方支持；体验会被锁死成 Windows-only，且无法跨平台 |

> ⚠️ **现实建议**：上面 4 个，**没有一个"既现代又能 Win7"** 的方案。任何迁移工作都是降级。

## 阶段拆分（待执行）

1. **Phase 1 — 项目基线调研**：盘点 main 分支的全部 Rust commands、Tauri APIs、SQLite3、`bcrypt`、`tokio`、`printpdf`、`rusqlite` 用法
2. **Phase 2 — 候选框架锁定**：拍板 Electron 22 / NW.js / WPF 中的一个
3. **Phase 3 — 渐进迁移**：
   - 复用前端的 React 18 + Vite 部分（Tauri 特有 API 改 IPC）
   - 改后端 / 本地数据库 / 业务逻辑
   - 命令封装重映射
4. **Phase 4 — 发布配置**：
   - Win7 产物用 `installer-builder` 之类的工具包 NSIS
   - 单独的 CI workflow（因为 main 是 `windows-latest`，Win7 build 跑不动）—— 必须用 GitHub-hosted `windows-2019`（其最后对 Win7 工具链兼容）
   - 不发 v1.x 同步版 — **Win7 release own tag,例如 `v1.0.0-win7`**
5. **Phase 5 — 文档**：DOCS 分叉，README 卡个跳页提示

## 不做的事（写在前面）

- **不在 main 分支回退到 Tauri 1** —— 这会让 v1.1.0 跨平台矩阵全废
- **不在 `feat/win7-legacy` 上用 Tauri 2** —— 浪费精力，结果一样不可用
- **不会让 main 的 CI 再交叉验证 Win7** —— 会拖累主发布

## 当前状态

```text
[main]      ← Tauri 2, 跨 x86_64/arm64, 跨 Win/Linux
  └── feat/win7-legacy  ← 仅 Win7 SP1 候选 (此分支)
```

下一步：在本分支上搭脚手架，确定候选框架（Phase 2）前不会硬写代码。

— 编写时：2026-07-09
