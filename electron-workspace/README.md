# electron-workspace/

> ⚠️ Scaffold stub — 真实 Tang 代码迁移尚未完成
> Win7 release 用。`feat/win7-legacy` 分支专属目录。

## 包含

```
main.js           Electron 22 主进程入口 (Win7 SP1 兼容)
preload.js        contextBridge 安全沙箱入口
package.json      Electron 22 + electron-builder 配置,
                  win.target = nsis + portable (两个 Win7 安装形态)
```

## 不包含 (Phase 3 之后会加)

- `services/` — 旧 src-tauri Rust services 1:1 重写到 JS/TS
- `ipc/` — 43 个 tauri command 重映射为 ipcMain.handle
- `db/` — better-sqlite3 替代 rusqlite (数据路径不变: %USERPROFILE%/.intern-rotation/data.db)
- `reports/` — ExcelJS + pdfkit 替代 rusqlite + printpdf + rusttype
- `auth/` — bcrypt 替代 (用 bcryptjs 兼容 Win7)

## 快速跑 (开发)

```bash
cd electron-workspace
npm install
npm start                       # 仅启 Electron 主进程 (白板窗)
```

## 发版

```bash
cd electron-workspace
npm install --no-audit          # 此处 install 真 Electron 22 + better-sqlite3
npm run dist:win7               # 输出 release/ 里的 NSIS installer + portable .exe
```

> 注意: `npm install` 会下载一个 native sqlite3 binary;Win7 上 `VC++ Redistributable 2015-2022` 必须装,**否则 better-sqlite3 加载会失败**。

## Win7 SP1 真机跑前还需

| 步骤 | 必要性 |
| --- | --- |
| Microsoft Visual C++ 2015-2022 Redistributable (x64) | 必备 |
| KB3033929 (Win7 上的 SHA-256 补丁) |  |
| KB4490628 (Win7 上的 TLS 1.2 fix) |  |
最后还由我们打包时 bundle 进去,还是要用户装?

> 推荐: 在 NSIS installer 里加 `VC_redist.x64.exe` 自检 / 安装, `electron-builder` 支持 `nsis.include` ;`portable` 形态则需用户自带。

## 与 main 分支差异

| 维度 | main (`Tauri 2`) | feat/win7-legacy (这里) |
| --- | --- | --- |
| 支持 OS | Win 10/11 / Linux x86_64-arm64 | 仅 Win 7 SP1 x64 |
| 安装包 | .exe (NSIS) + .deb + .AppImage | .exe (NSIS) + .exe (portable) |
| Release Tag | v1.x | v1.x-legacy7 |
| Release Owner | `win` matrix + `linux` matrix | 只 `win7-build` 单一 job |
| 推荐端口 | 1420 | (单进程) |
