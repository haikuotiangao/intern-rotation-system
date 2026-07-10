// main.js — Electron 22 main process (Win7 legacy flavor)
// ---------------------------------------------------------------------------
// Phase 3.1: 提供主进程 + 全 surface IPC handlers (项目原 43 个 tauri command).
// 本期仅 2 个 ipcMain.handle + 2 个 plugin 拦截 (dialog save / fs write_file),
// 后端业务 (rotation_service / intern_service / ...) 还没搬运,
// 实际走 "000 mock": 返回空/占位 result, 使 app 能 启动 + 前端能读 meal.
// 这是讲崩点走位干净 -> 后期 一步 步加 ipc handler, 全程不需要动前端.
//
// (实际 phase 3.2n期 全面 business ipc handlers 都在这里 importer)

// .......... user data 路径 (Win7 下为 %APPDATA%
// ............%USERPROFILE%\AppData\Roaming\) ..........
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Electron 22 + Win7: avoid spellcheck feature for stability
app.commandLine.appendSwitch(
  'disable-features',
  'CalculatedMobileContentCapture,SpareRendererForSitePerProcess'
)

// Alt path: appex userData 目录
const USER_DATA_DIR = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'intern-rotation-system'
)
try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }) } catch (e) { /* ignore */ }
try { app.setPath('userData', USER_DATA_DIR) } catch (e) { /* ignore */ }

// DB path in Win7: electron32性22 m 必须 + uber on Windows
const DB_PATH = path.join(USER_DATA_DIR, 'data.db')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '实习生管理系统 (Win7 legacy)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Tauri path: win 上 dist/index.html 为 React 入口
  const distIndex = path.resolve(__dirname, '..', 'dist', 'index.html')
  if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex, { hash: '/legacy-electron22' }).catch((err) => {
      console.error('[legacy-electron22] failed to load ../dist/index.html:', err)
      mainWindow.loadURL('data:text/html;charset=utf-8,<h1>intern-rotation-system (Win7)<br>scaffold</h1>')
    })
  } else {
    mainWindow.loadURL('data:text/html;charset=utf-8,<h1>dist/index.html not built yet</h1><p>Run "npm run build" in repo root first.</p>')
  }

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// IPC handlers: legacy:* 是 Win7 legacy 的未打包 plugin 代理
// cmd → 在 ipcMain.handle(cmd) 里 一同 main 中表达 (React 代码 0 改)
// ---------------------------------------------------------------------------

ipcMain.handle('legacy:dialog-show-save', async (_evt, options) => {
  const opts = options || {}
  const filters = (opts.filters || []).map((f) => ({
    name: f.name || '',
    extensions: Array.isArray(f.extensions) ? f.extensions : [],
  }))
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: opts.title || '保存',
    defaultPath: opts.defaultPath || undefined,
    filters: filters.length ? filters : undefined,
  })
  return { canceled, filePath: filePath || null }
})

ipcMain.handle('legacy:fs-write-file', async (_evt, { filePath, bytes }) => {
  // bytes 是 Uint8Array 转 Array.from 进来的
  if (!filePath) throw new Error('legacy:fs-write-file: filePath required')
  const buf = Buffer.from(bytes || [])
  await fs.promises.writeFile(filePath, buf)
  return true
})

ipcMain.handle('legacy:fs-read-text-file', async (_evt, { filePath, options }) => {
  const opts = options || {}
  if (!filePath) throw new Error('legacy:fs-read-text-file: filePath required')
  // Tauri read_text_file 同样 有: options 可能含 base64Config
  return fs.promises.readFile(filePath, 'utf8')
})

// ---------------------------------------------------------------------------
// Tauri commands 注册区 · 本期仅 mock 货 (43 个 "000 返回")
// 后期 Phase 3.2 逐步加真 ipcMain.handle
// ---------------------------------------------------------------------------
function mockReturn(cmd, defaultValue = null) {
  ipcMain.handle(cmd, async () => {
    // 老 Tauri 返回 null 或空数组或 0 (取决于返回值 type)
    // 人家业务代码 mv; 现在返回空架子, 这每一个 call 会在 UI 中看到 '未加载'.
    return defaultValue
  })
}

// intern_
mockReturn('get_interns', [])
mockReturn('get_intern', null)
mockReturn('create_intern', {})
mockReturn('update_intern', {})
mockReturn('delete_intern', null)
mockReturn('search_interns', [])
mockReturn('batch_import_interns', 0)
mockReturn('update_intern_allocation_status', null)

// department_
mockReturn('get_department_systems', [])
mockReturn('get_departments', [])
mockReturn('create_department_system', {})
mockReturn('update_department_system', {})
mockReturn('delete_department_system', null)
mockReturn('create_department', {})
mockReturn('update_department', {})
mockReturn('delete_department', null)
mockReturn('get_total_capacity', { total: 0, used: 0 })

// rotation_
mockReturn('pre_allocate_rotation', { count: 0 })
mockReturn('get_rotation_by_intern', [])
mockReturn('get_rotation_by_month', [])
mockReturn('get_all_current_rotation', [])
mockReturn('manual_adjust_rotation', null)
mockReturn('confirm_allocation', null)
mockReturn('reset_allocation', null)
mockReturn('clean_all_and_repreallocate_rotation', { count: 0 })
mockReturn('allocate_for_one_intern', null)

// archive_
mockReturn('auto_archive', { count: 0 })
mockReturn('restore_archive', null)
mockReturn('get_archived_interns', [])
mockReturn('search_archived_interns', [])

// settings_
mockReturn('change_password', null)
mockReturn('check_has_password', false)
mockReturn('setup_password', null)
mockReturn('verify_login', true)  // 默认連使密码为示意设别 — 后期接 db
mockReturn('get_operation_logs', [])
mockReturn('get_log_count', 0)

// report_
mockReturn('get_report_interns', [])
mockReturn('get_report_rotation_all', [])
mockReturn('get_report_departments', [])
mockReturn('export_rotation_plan_csv', { saved: false })
mockReturn('export_rotation_notice_pdf', { saved: false })
mockReturn('export_department_detail_csv', { saved: false })
mockReturn('filter_full_confirmed_intern_ids', [])
mockReturn('load_cjk_font', null)

// devtool_
mockReturn('open_devtools', null)

// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  app.setName('intern-rotation-electron')
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 项目全局错误 --此后后续期拓展
process.on('uncaughtException', (err) => {
  console.error('[legacy-electron22] uncaughtException:', err)
})
