// Electron 22 preload — contextBridge 走 IPC 防火墙
//
// 现在是 scaffold — 实际 43 个 Tauri command 重映射在这里:
// 见 docs/WIN7-LEGACY.md Phase 3。

const { contextBridge } = require('electron')

// 占位包: 真实迁移后会用 ipcRenderer.invoke 替换为 43 个 tauri command
contextBridge.exposeInMainWorld('legacyBridge', {
  version: '1.0.0-win7-scaffold',
  platform: 'electron22',
  // placeholder IPC
  ping: () => Promise.resolve('pong'),
})
