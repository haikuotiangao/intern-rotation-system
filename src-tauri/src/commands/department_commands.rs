use tauri::State;
use crate::store::AppState;
use crate::database::dao::departments::{Department, DepartmentSystem, DepartmentWithSystem};
use crate::services::department_service::DepartmentService;
use crate::error::AppError;

#[tauri::command]
pub fn get_department_systems(state: State<'_, AppState>) -> Result<Vec<DepartmentSystem>, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::find_all_systems(&conn)
}

#[tauri::command]
pub fn get_departments(state: State<'_, AppState>) -> Result<Vec<DepartmentWithSystem>, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::find_all_departments(&conn)
}

#[tauri::command]
pub fn create_department_system(state: State<'_, AppState>, system: DepartmentSystem, operator: String) -> Result<DepartmentSystem, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::create_system(&conn, &system, &operator)
}

#[tauri::command]
pub fn update_department_system(state: State<'_, AppState>, system: DepartmentSystem, operator: String) -> Result<DepartmentSystem, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::update_system(&conn, &system, &operator)
}

#[tauri::command]
pub fn delete_department_system(state: State<'_, AppState>, id: String, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::delete_system(&conn, &id, &operator)
}

#[tauri::command]
pub fn create_department(state: State<'_, AppState>, department: Department, operator: String) -> Result<Department, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::create_department(&conn, &department, &operator)
}

#[tauri::command]
pub fn update_department(state: State<'_, AppState>, department: Department, operator: String) -> Result<Department, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::update_department(&conn, &department, &operator)
}

#[tauri::command]
pub fn delete_department(state: State<'_, AppState>, id: String, operator: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::delete_department(&conn, &id, &operator)
}

#[tauri::command]
pub fn get_total_capacity(state: State<'_, AppState>) -> Result<i64, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentService::get_total_capacity(&conn)
}
