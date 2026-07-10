// electron-workspace/lib/intern.js - Mirror of InternService
const { load, save, nowMs, newId, logOp } = require('./db.js')

async function findAll(status) {
  const db = await load()
  if (!status) return db.interns.slice()
  return db.interns.filter(i => i.status === status)
}

async function findById(id) {
  const db = await load()
  return db.interns.find(i => i.id === id) || null
}

async function search(keyword, status) {
  const db = await load()
  const k = String(keyword || '').trim().toLowerCase()
  return db.interns.filter(i => {
    if (status && i.status !== status) return false
    if (!k) return true
    return [i.name, i.class_name, i.phone, i.parent_phone, i.graduate_school, i.remarks]
      .some(f => f && String(f).toLowerCase().includes(k))
  })
}

function validate(intern) {
  if (!intern.class_name) return 'missing class_name'
  if (!intern.name) return 'missing name'
  if (!intern.start_date) return 'missing start_date'
  return null
}

async function create(intern, operator) {
  const db = await load()
  const err = validate(intern)
  if (err) throw new Error(err)
  const now = nowMs()
  const created = {
    id: intern.id || newId(),
    class_name: intern.class_name,
    name: intern.name,
    gender: intern.gender || null,
    phone: intern.phone || null,
    parent_phone: intern.parent_phone || null,
    graduate_school: intern.graduate_school || null,
    remarks: intern.remarks || null,
    duration_months: intern.duration_months || 6,
    start_date: intern.start_date,
    end_date: intern.end_date || null,
    status: intern.status || 'active',
    fixed_department_id: intern.fixed_department_id || null,
    allocation_status: intern.allocation_status || 'ready',
    created_at: intern.created_at || now,
    updated_at: now,
  }
  db.interns.push(created)
  await save()
  logOp(operator, 'create_intern', `id=${created.id} name=${created.name}`)
  return created
}

async function update(intern, operator) {
  const db = await load()
  const idx = db.interns.findIndex(i => i.id === intern.id)
  if (idx === -1) throw new Error('intern not found')
  // start_date 变过去的校验 (f25) - 简化为: 与原值相同则跳过
  const old = db.interns[idx]
  const startChanged = intern.start_date && old.start_date !== intern.start_date
  if (startChanged) {
    const today = new Date().toISOString().slice(0, 10)
    if (intern.start_date < today) {
      throw new Error('start_date 不可为过去日期')
    }
  }
  const merged = {
    ...old,
    ...intern,
    updated_at: nowMs(),
  }
  // f22: fixed_department 切换联动: 简化版本——只写回字段,不重做 rotation logic
  delete merged.id
  db.interns[idx] = { ...db.interns[idx], ...merged, id: old.id }
  await save()
  logOp(operator, 'update_intern', `id=${intern.id}`)
  return db.interns[idx]
}

async function updateAlloction(internId, allocationStatus, operator) {
  const db = await load()
  const idx = db.interns.findIndex(i => i.id === internId)
  if (idx === -1) throw new Error('intern not found')
  db.interns[idx].allocation_status = allocationStatus
  db.interns[idx].updated_at = nowMs()
  await save()
  logOp(operator, 'update_intern_allocation_status', `id=${internId} status=${allocationStatus}`)
}

async function delete_(id, operator) {
  const db = await load()
  const idx = db.interns.findIndex(i => i.id === id)
  if (idx === -1) throw new Error('intern not found')
  db.interns.splice(idx, 1)
  // 同时清理 rotation_assignments
  db.rotation_assignments = db.rotation_assignments.filter(r => r.intern_id !== id)
  await save()
  logOp(operator, 'delete_intern', `id=${id}`)
}

async function batchImport(interns, operator) {
  let count = 0
  for (const i of interns) {
    try {
      await create(i, operator)
      count++
    } catch (e) {
      // ignore validation
    }
  }
  return count
}

module.exports = {
  findAll, findById, search, create, update,
  updateAlloction, delete_, batchImport,
}
