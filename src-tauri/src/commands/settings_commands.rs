use tauri::State;
use crate::store::AppState;
use crate::database::dao::logs::OperationLog;
use crate::services::settings_service::SettingsService;
use crate::services::log_service::LogService;
use crate::error::AppError;

#[tauri::command]
pub fn check_has_password(state: State<'_, AppState>) -> Result<bool, AppError> {
    let conn = state.db.lock().unwrap();
    SettingsService::has_password(&conn)
}

#[tauri::command]
pub fn verify_login(state: State<'_, AppState>, password: String) -> Result<bool, AppError> {
    let conn = state.db.lock().unwrap();
    SettingsService::verify_password(&conn, &password)
}

#[tauri::command]
pub fn setup_password(state: State<'_, AppState>, password: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    SettingsService::set_password(&conn, &password)
}

#[tauri::command]
pub fn change_password(state: State<'_, AppState>, old_password: String, new_password: String) -> Result<bool, AppError> {
    let conn = state.db.lock().unwrap();
    if !SettingsService::verify_password(&conn, &old_password)? {
        return Ok(false);
    }
    SettingsService::set_password(&conn, &new_password)?;
    Ok(true)
}

#[tauri::command]
pub fn get_operation_logs(state: State<'_, AppState>, page: i64, page_size: i64, action_type: Option<String>) -> Result<Vec<OperationLog>, AppError> {
    let conn = state.db.lock().unwrap();
    LogService::get_logs(&conn, page, page_size, action_type.as_deref())
}

#[tauri::command]
pub fn get_log_count(state: State<'_, AppState>) -> Result<i64, AppError> {
    let conn = state.db.lock().unwrap();
    LogService::get_log_count(&conn)
}
