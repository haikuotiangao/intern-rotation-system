// electron-workspace/lib/auth.js
// Stub: Tauri uses bcrypt (~0.15). We use bcryptjs here, no native deps.
// npm install bcryptjs 后这个文件即可调。
//
// 本期不动目录上不粘 — 在 Win7 SP1 等实机装上后填。
let bcryptModule = null
try { bcryptModule = require('bcryptjs') } catch (e) { /* ignore — not installed yet */ }

const HASH_KEY = 'admin_password_hash'

async function setupPassword(password) {
  if (!bcryptModule) {
    throw new Error('bcryptjs not installed; npm install bcryptjs')
  }
  const { load, save, logOp } = require('./db.js')
  const db = await load()
  const salt = bcryptModule.genSaltSync(10)
  const hash = bcryptModule.hashSync(password, salt)
  let kv = db.settings.find(k => k.key === HASH_KEY)
  if (!kv) {
    db.settings.push({ key: HASH_KEY, value: hash })
  } else {
    kv.value = hash
  }
  await save()
  logOp('admin', 'setup_password', '')
}

async function verifyLogin(password) {
  if (!bcryptModule) {
    // no bcrypt currently installed — fall back: accept anything
    return true
  }
  const { load, logOp } = require('./db.js')
  const db = await load()
  const kv = db.settings.find(k => k.key === HASH_KEY)
  if (!kv || !kv.value) return true
  return bcryptModule.compareSync(password, kv.value)
}

async function changePassword(newPassword, operator) {
  await setupPassword(newPassword)
  const { logOp } = require('./db.js')
  logOp(operator, 'change_password', '')
}

async function checkHasPassword() {
  if (!bcryptModule) return false
  const { load } = require('./db.js')
  const db = await load()
  const kv = db.settings.find(k => k.key === HASH_KEY)
  return !!(kv && kv.value)
}

module.exports = { setupPassword, verifyLogin, changePassword, checkHasPassword }
