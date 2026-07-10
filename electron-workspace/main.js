// main.js — Electron 22 main process (Win7 legacy flavor)
// ---------------------------------------------------------------------------
// Phase 3.2: 43 ipcMain.handle wired to lib/ service modules. Business logic
// floating on JSON file DB (lib/db.js). Front-end invokes the same name as the
// original Tauri command - no src/ change required.

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Win7 features off
app.commandLine.appendSwitch('disable-features', 'CalculatedMobileContentCapture,SpareRendererForSitePerProcess')

// Init db early - load + ensure settings
require('./lib/db.js').load().catch(err => console.error(err))

const USER_DATA_DIR = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'intern-rotation-system'
)
try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }) } catch (e) {}
try { app.setPath('userData', USER_DATA_DIR) } catch (e) {}

const DB_PATH = path.join(USER_DATA_DIR, 'data.json')

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
// legacy: dialog/fs plugin proxies
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
  if (!filePath) throw new Error('legacy:fs-write-file: filePath required')
  await fs.promises.writeFile(filePath, Buffer.from(bytes || []))
  return true
})

ipcMain.handle('legacy:fs-read-text-file', async (_evt, { filePath }) => {
  if (!filePath) throw new Error('legacy:fs-read-text-file: filePath required')
  return fs.promises.readFile(filePath, 'utf8')
})

// ---------------------------------------------------------------------------
// Load service modules
// ---------------------------------------------------------------------------
const intern = require('./lib/intern.js')
const department = require('./lib/department.js')
const rotation = require('./lib/rotation.js')
const archive = require('./lib/archive.js')
const auth = require('./lib/auth.js')
const log = require('./lib/log.js')
const report = require('./lib/report.js')

// Wrap async ipcMain.handle
function bind(cmd, handler) {
  ipcMain.handle(cmd, async (_evt, ...args) => {
    try {
      return await handler(...args)
    } catch (e) {
      console.error(`[legacy-electron22] handler ${cmd} error:`, e.message)
      throw e
    }
  })
}

// intern_
bind('get_interns', async (status) => intern.findAll(status || null))
bind('get_intern', async (id) => intern.findById(id))
bind('create_intern', async (intern2, operator) => intern.create(intern2, operator))
bind('update_intern', async (intern2, operator) => intern.update(intern2, operator))
bind('update_intern_allocation_status', async (internId, allocation_status, operator) =>
  intern.updateAlloction(internId, allocation_status, operator))
bind('delete_intern', async (id, operator) => intern.delete_(id, operator))
bind('search_interns', async (keyword, status) => intern.search(keyword, status || null))
bind('batch_import_interns', async (internsArr, operator) =>
  intern.batchImport(internsArr, operator || 'admin'))

// department_
bind('get_department_systems', async () => department.getSystems())
bind('get_departments', async () => department.getDepartments())
bind('create_department_system', async (system, operator) => department.createSystem(system, operator || 'admin'))
bind('update_department_system', async (system, operator) => department.updateSystem(system, operator || 'admin'))
bind('delete_department_system', async (id, operator) => department.deleteSystem(id, operator || 'admin'))
bind('create_department', async (dept, operator) => department.createDept(dept, operator || 'admin'))
bind('update_department', async (dept, operator) => department.updateDept(dept, operator || 'admin'))
bind('delete_department', async (id, operator) => department.deleteDept(id, operator || 'admin'))
bind('get_total_capacity', async () => department.getTotalCapacity())

// rotation_
bind('pre_allocate_rotation', async () => rotation.preAllocate())
bind('get_rotation_by_intern', async (internId) => rotation.getByIntern(internId))
bind('get_rotation_by_month', async (year, month) => rotation.getByMonth(year, month))
bind('get_all_current_rotation', async () => rotation.getAllCurrent())
bind('manual_adjust_rotation', async (internId, deptId, monthIndex, operator) =>
  rotation.manualAdjust(internId, deptId, monthIndex, operator || 'admin'))
bind('confirm_allocation', async (internId, operator) => rotation.confirmAllocation(internId, operator || 'admin'))
bind('reset_allocation', async (operator) => rotation.resetAllocation(operator || 'admin'))
bind('clean_all_and_repreallocate_rotation', async (operator) =>
  rotation.cleanAllAndRepreallocate(operator || 'admin'))
bind('allocate_for_one_intern', async (internId, operator) =>
  rotation.allocateForOne(internId, operator || 'admin'))

// archive_
bind('auto_archive', async () => archive.autoArchive(new Date().toISOString().slice(0, 10)))
bind('restore_archive', async (internId, operator) => archive.restoreArchive(internId, operator || 'admin'))
bind('get_archived_interns', async () => archive.getArchived())
bind('search_archived_interns', async (keyword) => archive.searchArchived(keyword))

// settings_
bind('change_password', async (newPassword, operator) => auth.changePassword(newPassword, operator || 'admin'))
bind('check_has_password', async () => auth.checkHasPassword())
bind('setup_password', async (password, operator) => auth.setupPassword(password))
bind('verify_login', async (password) => auth.verifyLogin(password))
bind('get_operation_logs', async (limit, offset) => log.getOperationLogs(limit, offset))
bind('get_log_count', async () => log.getLogCount())

// report_
bind('get_report_interns', async (status) => report.getReportInterns(status || null))
bind('get_report_rotation_all', async () => report.getReportRotationAll())
bind('get_report_departments', async () => report.getReportDepartments())
bind('export_rotation_plan_csv', async (operator) => report.exportRotationPlanCSV(operator || 'admin'))
bind('export_rotation_notice_pdf', async (year, month, operator) =>
  report.exportRotationNoticePDF(year, month, operator || 'admin'))
bind('export_department_detail_csv', async (operator) =>
  report.exportDepartmentDetailCSV(operator || 'admin'))
bind('filter_full_confirmed_intern_ids', async () => report.filterFullConfirmedInternIds())
bind('load_cjk_font', async () => report.loadCJKFont())

// devtool_
bind('open_devtools', async () => log.devtools(mainWindow && mainWindow.webContents))

// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  app.setName('intern-rotation-electron')
  createWindow()
})

app.on('window-all-closed', () => {
  require('./lib/db.js').flush()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

process.on('uncaughtException', (err) => {
  console.error('[legacy-electron22] uncaughtException:', err)
})
