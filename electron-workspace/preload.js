// preload.js — Win7 legacy flavor
// ---------------------------------------------------------------------------
// 这个 preload 桥接 Tauri 2 invoke() API 到 Electron IPC, 让前端代码
// (使用 `@tauri-apps/api/core` 的 invoke) 看到与 Tauri 一样的 API surface,
// 但底层走 Electron 22 的 ipcRenderer.invoke(),
//
// **关键设计**: 完全照 `window.__TAURI_INTERNALS__` surface shape
// (Tauri 2.11 API SDK 调用接口)。这样 React 业务代码 0 改动。
//
// 支持的 Tauri 调用面:
//   - invoke() -> ipcRenderer.invoke() 或特殊 intercept (plugin-dialog/save, plugin-fs/write_file 等)
//   - transformCallback / unregisterCallback / runCallback / callbacks: 仅占位 (我们不用 event)
//   - convertFileSrc: 用 file:// 协议返回
//   - metadata: 占位 JSON
//
// 不支持的: Tauri API 以外的事 (以为 invoke 是 win dows webview && win dialog fs API)

const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// 同期插件 (plugin-dialog save + plugin-fs writeFile) 在 Tauri API 层走 invoke,
// 在这里拦截 & 转为 electron 系统 dialog / fs
// ---------------------------------------------------------------------------

function electronSaveDialog(options) {
  //  同步封装 —— dialog.showSaveDialog 返回 Promise<{canceled, filePath}>
  //  在 Tauri 2 中, 'plugin:dialog|save' 这个 invoke 调用是 sync
  //  invoke 走 Promise<string|null> — cancels 时 返回 null
  //
  //  本函数返回 Promise<string|null>
  const webContentsObj = require('@electron/remote') && require('@electron/remote').getCurrentWebContents
  // Win7 用 main'l 装不入 @electron/remote, 直接用 modal dialog via ipc
  return ipcRenderer
    .invoke('legacy:dialog-show-save', options || {})
    .then((result) => {
      if (!result || result.canceled || !result.filePath) return null
      return result.filePath
    })
}

function electronWriteFile(filePath, bytes) {
  //  本地主进程 fs.writeFile 走 ipc 处理
  return ipcRenderer.invoke('legacy:fs-write-file', { filePath, bytes: Array.from(bytes) })
}

// ---------------------------------------------------------------------------
// 内核：invoke 拦截器
// ---------------------------------------------------------------------------

async function invoke(cmd, args = {}, options) {
  if (!cmd || typeof cmd !== 'string') {
    throw new Error('[legacy-electron22] invoke: cmd must be a non-empty string')
  }
  // plugin-dialog save
  if (cmd === 'plugin:dialog|save') {
    return electronSaveDialog((args && args.options) || {})
  }
  // plugin-fs write_file
  if (cmd === 'plugin:fs|write_file') {
    const a = args || {}
    return electronWriteFile(a.path || a.filePath, a.contents || a.data || a.bytes || [])
  }
  // plugin-fs read_text_file (本项目不用但补全)
  if (cmd === 'plugin:fs|read_text_file') {
    const a = args || {}
    return ipcRenderer.invoke('legacy:fs-read-text-file', { path: a.path })
  }
  // 其他都直接转发 ipcRenderer
  // 后端 main.js 已注册对应 handler
  return ipcRenderer.invoke(cmd, args, options)
}

// ---------------------------------------------------------------------------
// callback 转换存根 (本期不用 event, 仅补足 surface)
// ---------------------------------------------------------------------------
const callbacks = {}

function transformCallback(callback, once) {
  const id = 'cb_' + Math.random().toString(36).slice(2)
  callbacks[id] = { callback, once: !!once }
  return id
}

function unregisterCallback(id) {
  delete callbacks[id]
}

function runCallback(id, payload) {
  const c = callbacks[id]
  if (!c) return
  try {
    c.callback(payload)
  } catch (e) {
    console.error('[legacy-electron22] runCallback error:', e)
  }
  if (c.once) unregisterCallback(id)
}

// convertFileSrc: 以 file:// 协议返回
function convertFileSrc(filePath, protocol = 'asset') {
  return 'file:///' + String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

// ---------------------------------------------------------------------------
// 暴露为 window.__TAURI_INTERNALS__ (Tauri 2.x SDK 调用身份)
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', {
  invoke,
  transformCallback,
  unregisterCallback,
  runCallback,
  callbacks,
  convertFileSrc,
  metadata: {
    currentWindow: { label: 'main' },
    currentWebview: { label: 'main', windowLabel: 'main' },
  },
})

// 顺便暴露到 legacyBridge 方便原生代码路径
contextBridge.exposeInMainWorld('legacyBridge', {
  version: '1.0.0-win7',
  platform: 'electron22',
  isLegacyElectron22: true,
})
