// electron-workspace/lib/department.js
const { load, save, nowMs, newId, logOp } = require('./db.js')

async function getSystems() {
  const db = await load()
  return db.department_systems.slice()
}

async function getDepartments() {
  const db = await load()
  return db.departments.slice()
}

async function createSystem(system, operator) {
  const db = await load()
  if (!system.name) throw new Error('missing name')
  const created = {
    id: system.id || newId(),
    name: system.name,
    sort_order: system.sort_order || 0,
    is_rotation: system.is_rotation === undefined ? 1 : Number(system.is_rotation),
    rotation_interval: system.rotation_interval || 1,
  }
  db.department_systems.push(created)
  await save()
  logOp(operator, 'create_department_system', `id=${created.id} name=${created.name}`)
  return created
}

async function updateSystem(system, operator) {
  const db = await load()
  const idx = db.department_systems.findIndex(s => s.id === system.id)
  if (idx === -1) throw new Error('not found')
  db.department_systems[idx] = { ...db.department_systems[idx], ...system, id: db.department_systems[idx].id }
  await save()
  logOp(operator, 'update_department_system', `id=${system.id}`)
  return db.department_systems[idx]
}

async function deleteSystem(id, operator) {
  const db = await load()
  db.department_systems = db.department_systems.filter(s => s.id !== id)
  db.departments = db.departments.filter(d => d.system_id !== id)
  await save()
  logOp(operator, 'delete_department_system', `id=${id}`)
}

async function createDept(dept, operator) {
  const db = await load()
  if (!dept.name) throw new Error('missing name')
  if (!dept.system_id) throw new Error('missing system_id')
  const now = nowMs()
  const created = {
    id: dept.id || newId(),
    name: dept.name,
    system_id: dept.system_id,
    capacity: dept.capacity || 3,
    is_active: dept.is_active === undefined ? 1 : Number(dept.is_active),
    created_at: dept.created_at || now,
    updated_at: now,
  }
  db.departments.push(created)
  await save()
  logOp(operator, 'create_department', `id=${created.id} name=${created.name}`)
  return created
}

async function updateDept(dept, operator) {
  const db = await load()
  const idx = db.departments.findIndex(d => d.id === dept.id)
  if (idx === -1) throw new Error('not found')
  db.departments[idx] = {
    ...db.departments[idx],
    ...dept,
    id: db.departments[idx].id,
    updated_at: nowMs(),
  }
  await save()
  logOp(operator, 'update_department', `id=${dept.id}`)
  return db.departments[idx]
}

async function deleteDept(id, operator) {
  const db = await load()
  db.departments = db.departments.filter(d => d.id !== id)
  // 清理 fixed_department_id
  db.interns.forEach(i => { if (i.fixed_department_id === id) i.fixed_department_id = null })
  await save()
  logOp(operator, 'delete_department', `id=${id}`)
}

async function getTotalCapacity() {
  const db = await load()
  const total = db.departments.filter(d => d.is_active).reduce((s, d) => s + (d.capacity || 0), 0)
  // used 已分配用 rotation_assignments 统计
  const used = db.rotation_assignments.filter(r => r.status !== 'pre_alloc').length
  return { total, used }
}

module.exports = {
  getSystems, getDepartments,
  createSystem, updateSystem, deleteSystem,
  createDept, updateDept, deleteDept,
  getTotalCapacity,
}
