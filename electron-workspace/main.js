// Electron 22 main process — Win7 legacy flavor
// ---------------------------------------------------------------------------
// 这个文件是脚手架起点:真正的 Tauri → Electron 适配工作尚未完成,
// 见 docs/WIN7-LEGACY.md 拆分阶段。
// 现阶段只显示一个空白窗口,用来让 Win7 的 NSIS / portable builder 通过
// 端到端 pipeline,反向证 "Win7 release 流水线" 这个概念。

const { app, BrowserWindow } = require('electron')

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '实习生管理系统 (Win7 legacy)',
    webPreferences: {
      preload: __dirname + '/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false  // Electron 22 + better-sqlite3 tradeoff; we ship preload bridge only
    }
  })

  // 临时: 演示从 main 进程加载 index.html (Tauri 路径上是 React build 出的 dist/)
  // 真实迁移时: win.loadFile('../dist/index.html') —— vite build 仍由根 npm run build 走
  win.loadFile('../dist/index.html', { hash: '/legacy-electron22' }).catch(err => {
    console.error('[legacy-electron22] failed to load UI:', err)
    // 显示空白 + 提示, 让 NSIS 产物能正确产生
    win.loadURL('data:text/html;charset=utf-8,<h1>实习生管理系统 Win7 legacy - scaffold</h1>')
  })

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

// Electron 22 + Win7 SP1: 一些系统菜单不喜欢 "mdi" 默认. 关掉 spellChecker
app.commandLine.appendSwitch('disable-features', 'CalculatedMobileContentCapture')

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // electron 22 + Win7 习惯: Win 下一律退出
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
