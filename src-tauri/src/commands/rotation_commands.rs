use tauri::State;
use crate::store::AppState;
use crate::database::dao::rotation::RotationWithNames;
use crate::services::rotation_service::RotationService;
use crate::error::AppError;

#[tauri::command]
pub fn pre_allocate_rotation(state: State<'_, AppState>) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::pre_allocate(&conn)
}

#[tauri::command]
pub fn get_rotation_by_intern(state: State<'_, AppState>, intern_id: String) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::get_by_intern(&conn, &intern_id)
}

#[tauri::command]
pub fn get_rotation_by_month(state: State<'_, AppState>, month_index: i32) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::get_by_month(&conn, month_index)
}

#[tauri::command]
pub fn get_all_current_rotation(state: State<'_, AppState>) -> Result<Vec<RotationWithNames>, AppError> {
    eprintln!("[RotationCommands] get_all_current_rotation: entered");
    let conn = state.db.lock().unwrap();
    eprintln!("[RotationCommands] get_all_current_rotation: got db lock, calling service");
    let result = RotationService::get_all_current(&conn);
    if let Err(ref e) = result {
        eprintln!("[RotationCommands] get_all_current_rotation FAILED: {:?}", e);
    } else if let Ok(ref data) = result {
        eprintln!("[RotationCommands] get_all_current_rotation returned {} rows", data.len());
        for r in data {
            eprintln!("[RotationCommands]   id={} intern={} dept={} sys={} month={} start={:?} end={:?} status={}",
                r.id, r.intern_name, r.department_name, r.system_name, r.month_index, r.start_date, r.end_date, r.status);
        }
    } else {
        eprintln!("[RotationCommands] get_all_current_rotation: unexpected state");
    }
    result
}

#[tauri::command]
pub fn manual_adjust_rotation(state: State<'_, AppState>, assignment_id: String, new_department_id: String, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::manual_adjust(&conn, &assignment_id, &new_department_id, &operator)
}

#[tauri::command]
pub fn confirm_allocation(state: State<'_, AppState>, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::confirm_allocation(&conn, &operator)
}

#[tauri::command]
pub fn reset_allocation(state: State<'_, AppState>, operator: String) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::reset_allocation(&conn, &operator)
}

/// r13: 清空全部轮转记录(包含 confirmed)并重新预分配。
/// 调用示例:`invoke('clean_all_and_repreallocate_rotation', { operator: '管理员' })`
/// 返回新的 rotation rows(pre_alloc)。
#[tauri::command]
pub fn clean_all_and_repreallocate_rotation(state: State<'_, AppState>, operator: String) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::clean_all_and_repreallocate(&conn, &operator)
}

/// 为单个实习生批量写入预分配记录
/// 调用示例:`invoke('allocate_for_one_intern', { internId: '...', allocations: [{ department_id, month_index }], operator: '管理员' })`
/// 注:Tauri 自动将顶层 camelCase 转 snake_case;嵌套 struct 字段按 serde 字段名直传(此处 AllocationInput 的字段是 snake_case)。
#[tauri::command]
pub fn allocate_for_one_intern(
    state: State<'_, AppState>,
    intern_id: String,
    allocations: Vec<AllocationInput>,
    operator: String,
) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationService::allocate_for_one_intern(
        &conn,
        &intern_id,
        &allocations
            .iter()
            .map(|a| (a.month_index, a.department_id.clone()))
            .collect::<Vec<_>>(),
        &operator,
    )?;
    RotationService::get_by_intern(&conn, &intern_id)
}

/// 单条预分配输入 — Tauri command 入参 Snakecase via serde 反射
#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
pub struct AllocationInput {
    pub department_id: String,
    pub month_index: i32,
}
