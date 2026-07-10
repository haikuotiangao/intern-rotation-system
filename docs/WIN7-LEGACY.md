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

## 设计核心: 前端 0 改动 ↔ preload invoke 桥接

**目标**：让 `src/lib/api/*.ts` 里 `import { invoke } from "@tauri-apps/api/core"` 的代码能够不经修改就在 Electron 22 内运行。

**实现路径**（Phase 3 已落地）：

1. **Tauri 2 SDK 的 invoke()** 内部走 `window.__TAURI_INTERNALS__.invoke(cmd, args, options)`
2. **Electron preload.js** 中把 `__TAURI_INTERNALS__` 注入到 window 上,匹配 Tauri 2 SDK 函数 shape:
   - `invoke(cmd, args, options)` —— 主路径, 特殊拦截 `plugin:dialog|save` 转 Electron dialog, `plugin:fs|write_file` / `read_text_file` 转 Node fs
   - `transformCallback / unregisterCallback / runCallback / callbacks` —— 占位 (本期不订阅事件)
   - `convertFileSrc` —— `file://///` 协议返回
   - `metadata` —— 占位 JSON
3. **Electron main.js** 注册 `ipcMain.handle(cmd, handler)` for each business command v↔ Tauri commands 一一对应

**结果**：前端 `import { invoke } from "@tauri-apps/api/core"` 看似调用 Tauri, 实际转到 Electron IPC. **代码逻辑 0 改动**, **UI 0 改动**.

## Phase 进展

| Phase | 描述 | 状态 |
| --- | --- | --- |
| Phase 1 - 项目基线调研 | 盘点 43 个 tauri command + 2322 行 Rust services | ✅ |
| Phase 2 - 候选框架锁定 | 选 Electron 22 | ✅ |
| Phase 3.1 - scaffold + bridge | `electron-workspace/{package,main,preload}.js` + mock 43 IPC | ✅ |
| Phase 3.2 - business 迁移 | 40+ command stub (mock) 待真业务实现 | 🟡 placeholder |
| Phase 3.3 - DB 层 | better-sqlite3 native 上表 。当前是 framework ready,未接 | ⚪️ |
| Phase 4 - Win7 CI | `.github/workflows/win7-legacy-build.yml` (windows-2019 + electron-builder) | ✅ |
| Phase 5 - Win7 SP1 用户验证 | 需 user 在真机 上装 NSIS | ⚪️ |

## 技术候选

| 候选 | 是否可行 | 备注 |
| --- | --- | --- |
| **Tauri 1** | ⚠️ | 调 system WebView2 → fail |
| **Electron 22.x** | ✅ **选中** | 最后 Win7 SP1 |
| NW.js 0.66+ | ✅ | electron 是 主流 |
| .NET 4.8 WPF | ✅ | Windows only |

## 阶段拆分 (未变)

## 不做的事（写在前面）

- **不在 main 分支回退到 Tauri 1**
- **不在 `feat/win7-legacy` 上用 Tauri 2**
- **不会让 main 的 CI 再交叉验证 Win7**
- **不会完全重写前端代码**——业务逻辑与布局不变

## 当前状态

```text
[main]      ← Tauri 2, 跨 x86_64/arm64, 跨 Win/Linux
  └── feat/win7-legacy  ← Win7 SP1 路径
        electron-workspace/    preload invoke bridge + Electron 22 main + electron-builder
        .github/workflows/win7-legacy-build.yml  ← windows-2019 pipeline
        docs/WIN7-LEGACY.md    (本文件)
```

## 启动开发

```bash
cd electron-workspace
npm install                # postinstall 重建 better-sqlite3 native
npm start                  # 启动 Electron, 加载上级 ../dist/index.html
```

## Build Win7 发布

```bash
cd electron-workspace
npm run dist:win7          # NSIS + portable exe
# 发布:
git tag v1.0.0-legacy7   # 任何 个约 v*-legacy7 typetag
git push origin v1.0.0-legacy7
```

## 下一步

Phase 3.2: 鸟档期 43 个 command stub, 治手 上表 后 业务连。

— 更新：2026-07-09 (Phase 3.1 达成)
