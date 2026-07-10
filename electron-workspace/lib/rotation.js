// electron-workspace/lib/rotation.js
// ⚠️ Phase 3.2 stub — algorithmic rotation not implemented yet.
// 只是把 rotation_assignments 的 CRUD + 简单 select 实现.
// 真正的"报告/排班/MRV 启发式"算法 见 src-tauri/src/services/rotation_service.rs
// 后期任务。
const { load, save, nowMs, newId, logOp } = require('./db.js')

async function preAllocate(toMonth) {
  // 占位实现 — 实际算法留待 Phase 3.3+
  const db = await load()
  const ready = db.interns.filter(i => i.allocation_status === 'ready')
  const now = nowMs()
  let count = 0
  const dm = db.departments.filter(d => d.is_active)
  for (let i = 0; i < ready.length; i++) {
    const intern = ready[i]
    const dept = dm[i % dm.length]
    if (!dept) continue
    db.rotation_assignments.push({
      id: newId(),
      intern_id: intern.id,
      department_id: dept.id,
      month_index: 0,
      start_date: intern.start_date,
      end_date: null,
      status: 'pre_alloc',
      created_at: now,
      updated_at: now,
    })
    intern.allocation_status = 'pre_allocated'
    intern.updated_at = now
    count++
  }
  await save()
  logOp('system', 'pre_allocate_rotation', `count=${count}`)
  return { count }
}

async function confirmAllocation(internId, operator) {
  const db = await load()
  let n = 0
  for (const r of db.rotation_assignments) {
    if (r.intern_id === internId && r.status === 'pre_alloc') {
      r.status = 'confirmed'
      r.updated_at = nowMs()
      n++
    }
  }
  if (n > 0) {
    const intern = db.interns.find(i => i.id === internId)
    if (intern) {
      intern.allocation_status = 'confirmed'
      intern.updated_at = nowMs()
    }
  }
  await save()
  logOp(operator, 'confirm_allocation', `intern=${internId} count=${n}`)
}

async function resetAllocation(operator) {
  const db = await load()
  // 只清 pre_alloc && start_date >= 今日
  const today = new Date().toISOString().slice(0, 10)
  let count = 0
  db.rotation_assignments = db.rotation_assignments.filter(r => {
    if (r.status === 'pre_alloc' && (r.start_date || '') >= today) {
      count++
      return false
    }
    return true
  })
  // 还原 ready 状态
  db.interns.forEach(i => {
    if (i.allocation_status === 'pre_allocated') {
      i.allocation_status = 'ready'
      i.updated_at = nowMs()
    }
  })
  await save()
  logOp(operator, 'reset_allocation', `removed=${count}`)
  return { removed: count }
}

async function cleanAllAndRepreallocate(operator) {
  const db = await load()
  db.rotation_assignments = []
  db.interns.forEach(i => {
    i.allocation_status = 'ready'
    i.updated_at = nowMs()
  })
  await save()
  logOp(operator, 'clean_all_and_repreallocate_rotation', '')
  return { count: 0 }
}

async function getByIntern(internId) {
  const db = await load()
  return db.rotation_assignments
    .filter(r => r.intern_id === internId)
    .sort((a, b) => a.month_index - b.month_index)
}

async function getByMonth() {
  const db = await load()
  return db.rotation_assignments.slice()
}

async function getAllCurrent() {
  const db = await load()
  return db.rotation_assignments
    .filter(r => r.status !== 'pre_alloc')
    .sort((a, b) => a.start_date && b.start_date ? a.start_date.localeCompare(b.start_date) : 0)
}

async function manualAdjust(internId, deptId, monthIndex, operator) {
  const db = await load()
  let entry = db.rotation_assignments.find(r => r.intern_id === internId && r.month_index === monthIndex)
  if (!entry) {
    entry = {
      id: newId(),
      intern_id: internId,
      department_id: deptId,
      month_index: monthIndex,
      start_date: null,
      end_date: null,
      status: 'confirmed',
      created_at: nowMs(),
      updated_at: nowMs(),
    }
    db.rotation_assignments.push(entry)
  } else {
    entry.department_id = deptId
    entry.updated_at = nowMs()
  }
  await save()
  logOp(operator, 'manual_adjust_rotation', '')
}

async function allocateForOne(internId, operator) {
  const db = await load()
  const intern = db.interns.find(i => i.id === internId)
  if (!intern) return null
  const dept = db.departments.find(d => d.is_active)
  if (!dept) return null
  const entry = {
    id: newId(),
    intern_id: internId,
    department_id: dept.id,
    month_index: 0,
    start_date: intern.start_date,
    end_date: null,
    status: 'pre_alloc',
    created_at: nowMs(),
    updated_at: nowMs(),
  }
  db.rotation_assignments.push(entry)
  intern.allocation_status = 'pre_allocated'
  intern.updated_at = nowMs()
  await save()
  logOp(operator, 'allocate_for_one_intern', `intern=${internId}`)
  return entry
}

module.exports = {
  preAllocate, confirmAllocation, resetAllocation,
  cleanAllAndRepreallocate, getByIntern, getByMonth, getAllCurrent,
  manualAdjust, allocateForOne,
}
