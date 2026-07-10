// electron-workspace/lib/archive.js — stub
const { load, save, nowMs, newId, logOp } = require('./db.js')

async function autoArchive(cutoffDate, operator) {
  // 占位 — full应实现 dump rot 排班 finish
  const db = await load()
  let count = 0
  db.interns.forEach(i => {
    if (i.status === 'active' && i.end_date && i.end_date < cutoffDate) {
      i.status = 'archived'
      i.updated_at = nowMs()
      count++
    }
  })
  await save()
  logOp(operator, 'auto_archive', `count=${count}`)
  return { count }
}

async function restoreArchive(internId, operator) {
  const db = await load()
  const intern = db.interns.find(i => i.id === internId)
  if (!intern) return
  intern.status = 'active'
  intern.updated_at = nowMs()
  await save()
  logOp(operator, 'restore_archive', `id=${internId}`)
}

async function getArchived() {
  const db = await load()
  return db.interns.filter(i => i.status === 'archived')
}

async function searchArchived(keyword) {
  const db = await load()
  const k = String(keyword || '').trim().toLowerCase()
  return db.interns.filter(i => i.status === 'archived').filter(i => {
    if (!k) return true
    return [i.name, i.class_name, i.graduate_school].some(f => f && String(f).toLowerCase().includes(k))
  })
}

module.exports = { autoArchive, restoreArchive, getArchived, searchArchived }
