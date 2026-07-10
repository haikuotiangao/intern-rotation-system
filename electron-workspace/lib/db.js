// electron-workspace/lib/db.js
// JSON file DB (no native deps). Mirrors the SQLite schema in
// src-tauri/src/database/schema.rs as much as we need for stubs.
// Data lives in %APPDATA%/intern-rotation-system/data.json (Win).

const fs = require('fs')
const path = require('path')

function emptyDb() {
  return {
    department_systems: [],
    departments: [],
    interns: [],
    rotation_assignments: [],
    operation_logs: [],
    settings: { key: 'schema_version', value: '1.0.0' },
  }
}

function getDbPath() {
  const base =
    process.env.APPDATA ||
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  const dir = path.join(base, 'intern-rotation-system')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.json')
}

let _db = null
let _saveTimer = null
let _path = null

async function load() {
  if (_db) return _db
  _path = getDbPath()
  if (fs.existsSync(_path)) {
    try {
      _db = JSON.parse(fs.readFileSync(_path, 'utf-8'))
    } catch (e) {
      console.error('[legacy-electron22 db] corrupt, resetting:', e)
      _db = emptyDb()
    }
  } else {
    _db = emptyDb()
  }
  // ensure all keys exist (defensive for partial old data)
  const def = emptyDb()
  for (const k of Object.keys(def)) {
    if (!_db[k]) _db[k] = []
  }
  if (!_db.settings) _db.settings = def.settings
  return _db
}

function save() {
  if (!_db || !_path) return
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(_path, JSON.stringify(_db, null, 2))
      _saveTimer = null
    } catch (e) {
      console.error('[legacy-electron22 db] save failed:', e)
    }
  }, 100)
}

function flush() {
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  if (_db && _path) {
    try { fs.writeFileSync(_path, JSON.stringify(_db, null, 2)) } catch (e) { /* ignore */ }
  }
}

function nowMs() { return Date.now() }
function newId() { return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) }

async function logOp(operator, actionType, actionDetail) {
  const db = await load()
  db.operation_logs.push({
    id: newId(),
    operator: operator || '',
    action_type: actionType,
    action_detail: actionDetail,
    created_at: nowMs(),
  })
  if (db.operation_logs.length > 10000) {
    db.operation_logs.splice(0, db.operation_logs.length - 10000)
  }
  save()
}

module.exports = {
  load, save, flush, nowMs, newId, logOp,
}
