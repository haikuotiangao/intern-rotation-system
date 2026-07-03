use tauri::State;
use crate::store::AppState;
use crate::database::dao::interns::Intern;
use crate::services::intern_service::InternService;
use crate::error::AppError;

#[tauri::command]
pub fn get_interns(state: State<'_, AppState>, status: Option<String>) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::find_all(&conn, status.as_deref())
}

#[tauri::command]
pub fn get_intern(state: State<'_, AppState>, id: String) -> Result<Option<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::find_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_intern(state: State<'_, AppState>, intern: Intern, operator: String) -> Result<Intern, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::create(&conn, &intern, &operator)
}

#[tauri::command]
pub fn update_intern(state: State<'_, AppState>, intern: Intern, operator: String) -> Result<Intern, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::update(&conn, &intern, &operator)
}

/// 单独修改 allocation_status — 走 InternService::update_allocation,
/// 注意:rotation 相关 mutation 会自动维护该字段;本命令只用于 UI 端主动覆盖。
/// 调用示例:`invoke('update_intern_allocation_status', { internId: 'xxx', allocationStatus: 'ready', operator: '管理员' })`
#[tauri::command]
pub fn update_intern_allocation_status(
    state: State<'_, AppState>,
    intern_id: String,
    allocation_status: String,
    operator: String,
) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    InternService::update_allocation(&conn, &intern_id, &allocation_status, &operator)
}

#[tauri::command]
pub fn delete_intern(state: State<'_, AppState>, id: String, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    InternService::delete(&conn, &id, &operator)
}

#[tauri::command]
pub fn search_interns(state: State<'_, AppState>, keyword: String, status: Option<String>) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::search(&conn, &keyword, status.as_deref())
}

#[tauri::command]
pub fn batch_import_interns(state: State<'_, AppState>, interns: Vec<Intern>, operator: String) -> Result<i32, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::batch_import(&conn, &interns, &operator)
}
