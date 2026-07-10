// electron-workspace/lib/log.js
const { load, save, logOp } = require('./db.js')

async function getOperationLogs(limit, offset) {
  const db = await load()
  const start = offset || 0
  const end = limit ? (start + limit) : undefined
  return db.operation_logs.slice(start, end)
}

async function getLogCount() {
  const db = await load()
  return db.operation_logs.length
}

async function devtools(window) {
  if (window && typeof window.openDevTools === 'function') window.openDevTools()
  logOp('dev', 'open_devtools', 'stub')
}

module.exports = { getOperationLogs, getLogCount, devtools }
