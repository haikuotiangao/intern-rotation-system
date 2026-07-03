# 08 · 构建与部署

> 开发环境、生产环境、安装包产出的全部命令与注意事项。
>
> **最近更新：2026-07-03** — v1.0.0 release profile 已精简：`lto=fat`、`codegen-units=1`、`strip=symbols`、`opt-level=s`、`panic=abort`；删除 PDF 嵌入式字体 → 安装包体积从原 11.65MB 压到 **2.65MB**（约 77% 体积下降）；新增 GitHub Actions CI（Windows NSIS + Linux deb + AppImage）。

## 1. 环境前置

| 工具 | 建议版本 | 检查 |
| --- | --- | --- |
| Node.js | 18 LTS | `node --version` |
| npm | 9+ | `npm --version` |
| Rust | stable（1.7x+） | `rustc --version` |
| cargo | 随 Rust 安装 | `cargo --version` |
| MSVC Build Tools（Windows） | Visual Studio Build Tools | 用于 rusqlite 编译 |
| Tauri CLI | 全局 | `@tauri-apps/cli` |

> macOS / Linux 上 `rusqlite` 通常自动使用系统 sqlite，无需捆绑；本项目用 `bundled` 特性自带。

## 2. 初始化

```bash
git clone ...
cd intern-rotation-system
npm install                   # 安装前端依赖
```

> `src-tauri/target/` 在 `.gitignore` 中，无需提交。

## 3. 开发模式

```bash
# 方式 A：分开启动
cargo run --manifest-path src-tauri/Cargo.toml   # 启动 Rust，先会编译
npm run dev                                      # 启动 Vite dev server (http://localhost:1420)

# 方式 B（推荐）：Tauri 一键启
npm run tauri dev                                # 自动按 tauri.conf.json 配置拉起前端 + 后端
```

- Vite 监听 5173，启动后 Tauri 自动连到 dev URL
- Rust 代码改动会自动 rebuild，Vite HMR 立即生效

## 4. 类型 / 代码健康度检查

```bash
cargo check --manifest-path src-tauri/Cargo.toml     # Rust 类型检查
npx tsc --noEmit                                    # TS 类型检查（推荐每次保存前）
```

## 5. 生产构建

```bash
# 在项目根目录
npm run tauri build
```

流程：
1. Tauri 先跑 `beforeBuildCommand: "npm run build"` → Vite 打包到 `dist/`
2. `cargo build --release` → `src-tauri/target/release/`
3. 打包 NSIS installer → `output/`

### 5.1 构建产物

| 类型 | 路径 |
| --- | --- |
| 单文件可执行 | `src-tauri/target/release/intern-rotation-system.exe` |
| 安装包 (NSIS) | `output/实习生管理系统_1.0.0_x64-setup.exe`（**v1.0.0 约 2.65 MB**） |
| 安装包（deb / AppImage） | CI 自动产出 |

> `tauri.conf.json` 的 `bundle.targets = ["nsis", "deb", "appimage"]` — Windows 本地构建 only NSIS，CI 自动加 Linux 目标。

### 5.2 性能优化点（v1.0.0 精简）

- `rusqlite` 用 `bundled` 特性避免依赖系统库，但增加 ~1 MB 二进制体积
- Rust 端 release 配置（见 `Cargo.toml`）：
  ```toml
  [profile.release]
  lto = "fat"
  codegen-units = 1
  strip = "symbols"
  opt-level = "s"
  panic = "abort"
  ```
- r10 修复：**PDF 字体不再用 `include_bytes!` 内嵌**（原 +9.75 MB），改为运行时优先扫描 `fonts/SourceHanSansSC-Regular.ttf` → Windows 系统 TTF/TTC 兜底
- 前端 Vite build，已开启 tree-shaking 与 css minify
- 前端依赖精简：移除 `@radix-ui/*`、`react-hook-form`、`zod`、`recharts`、`dnd-kit/*`、`@react-pdf/renderer` 等

## 6. 数据持久化与迁移

- 数据库文件路径：`%USERPROFILE%\.intern-rotation\data.db`
- 升级版本时通过 `schema.rs::migrate_schema()` 自动运行 `ALTER TABLE`
- 升级前建议手动备份 `data.db`

```bash
# 备份示例（升级前执行）
copy %USERPROFILE%\.intern-rotation\data.db data.db.bak
```

## 7. 发布的版本号变更

每次重大升级需修改：

```jsonc
// src-tauri/tauri.conf.json
{ "version": "1.1.0" }
```

```toml
# src-tauri/Cargo.toml
version = "1.1.0"
```

```jsonc
// package.json
{ "version": "1.1.0" }
```

## 8. 应用元数据

| 项 | 值 |
| --- | --- |
| 名称 | 实习生管理系统 |
| 包名 | com.intern-rotation.system |
| 窗口大小 | 1400 × 900，最小 1200 × 800 |
| 数据目录 | `~/.intern-rotation/data.db` |
| 日志目录 | （当前未配置） |
| v1.0.0 安装包体积 | 约 **2.65 MB**（NSIS） |

## 8.5 跨平台 CI（v1.0.0 新增）

`.github/workflows/build.yml` 跨平台工作流：

| Job | Runner | 产物 | 触发 |
| --- | --- | --- | --- |
| `build-windows` | `windows-latest`（30 min） | NSIS `.exe` 上传到 artifact `实习生管理系统_Windows_x64` | push to main / PR / workflow_dispatch |
| `build-linux` | `ubuntu-22.04`（30 min） | `.deb` + `.AppImage` 上传到 artifact `实习生管理系统_Linux_x64` | 同上 |

CI 配置要点：
- Node 20 + Rust stable
- Linux job 预装：`libwebkit2gtk-4.1-dev`、`libsoup-3.0-dev`、`libjavascriptcoregtk-4.1-dev`、`librsvg2-dev`、`libayatana-appindicator3-dev`、`xorg-dev`、`libasound2-dev` 等 Tauri 2 Linux 依赖
- `tauri signing private key` 留空（无代码签名）
- `concurrency`：同一 ref 的旧运行自动 cancel

## 9. 常见构建问题

### 9.1 rusqlite 编译失败

```
error: failed to run custom build command for `libsqlite3-sys`
```

解决：安装 Visual Studio Build Tools 2022。

### 9.2 npm 依赖 vulernability 警告

可忽略开发期警告；生产构建不影响。

### 9.3 Rust cache 大

```bash
# 清理（慎用）
cargo clean --manifest-path src-tauri/Cargo.toml
```

### 9.4 中文乱码（PDF）

PDF 中文字体若加载失败会回退到错误信息。需保证 Windows 字体目录中至少有一份中文字体（见 `report_commands.rs::load_cjk_font`）。

## 10. 后续优化清单（v1.0.0 已处理部分）

- [x] `Cargo.toml` 加 release profile 配置：`lto = fat, codegen-units = 1, strip = symbols, opt-level = s, panic = abort`（v1.0.0 已合并）
- [x] PDF 字体从 `include_bytes!` 改为运行时优先扫描（r10；体积 -9.75MB）
- [x] 前端依赖精简：移除 `@radix-ui/*` / `react-hook-form` / `zod` / `recharts` / `dnd-kit/*` / `@react-pdf/renderer`
- [x] GitHub Actions CI 配置（Windows NSIS + Linux deb/AppImage）
- [ ] `tauri-plugin-shell` 等未用插件已从 Cargo.toml 整体移除（无需再注册）
