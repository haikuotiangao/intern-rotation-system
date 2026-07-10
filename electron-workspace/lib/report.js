// electron-workspace/lib/report.js
// Stub. report_commands.rs 是 780 行: 含 PDF (printpdf + rusttype)
// + Excel + CSV 导出. 本期只留简单 CSV stub. 占位返回.
const { load, save, nowMs, logOp } = require('./db.js')

const Intern = require('./intern.js')
const Dept = require('./department.js')

async function getReportInterns(status) {
  return Intern.findAll(status)
}

async function getReportRotationAll() {
  const db = await load()
  return db.rotation_assignments.slice()
}

async function getReportDepartments() {
  return Dept.getDepartments()
}

async function exportsCsv(filename, lines, operator) {
  // Principal 记录打开外部使用 fs.writeFile (preload bridge)
  const { dialog, ipcMain } = require('electron')
  logOp(operator, 'export_csv', `${filename} lines=${lines.length}`)
  // Actually: this is from main process side; ipcMain handler will be in main.js
  return { saved: false, path: null }
}

async function exportRotationPlanCSV(operator) {
  return { saved: false, path: null }
}

async function exportRotationNoticePDF(year, month, operator) {
  return { saved: false, path: null }
}

async function exportDepartmentDetailCSV(operator) {
  return { saved: false, path: null }
}

async function filterFullConfirmedInternIds() {
  const db = await load()
  return db.interns
    .filter(i => i.allocation_status === 'confirmed')
    .map(i => i.id)
}

async function loadCJKFont() {
  return null
}

module.exports = {
  getReportInterns,
  getReportRotationAll,
  getReportDepartments,
  exportRotationPlanCSV,
  exportRotationNoticePDF,
  exportDepartmentDetailCSV,
  filterFullConfirmedInternIds,
  loadCJKFont,
}
