use tauri::State;
use crate::store::AppState;
use crate::database::dao::interns::Intern;
use crate::services::archive_service::ArchiveService;
use crate::error::AppError;

#[tauri::command]
pub fn auto_archive(state: State<'_, AppState>) -> Result<i32, AppError> {
    let conn = state.db.lock().unwrap();
    ArchiveService::auto_archive(&conn)
}

#[tauri::command]
pub fn restore_archive(state: State<'_, AppState>, intern_id: String, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    ArchiveService::restore_from_archive(&conn, &intern_id, &operator)
}

#[tauri::command]
pub fn get_archived_interns(state: State<'_, AppState>) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    ArchiveService::find_archived(&conn)
}

#[tauri::command]
pub fn search_archived_interns(state: State<'_, AppState>, keyword: String) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    ArchiveService::search_archived(&conn, &keyword)
}
