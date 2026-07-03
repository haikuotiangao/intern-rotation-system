mod error;
mod store;
mod database;
mod services;
mod commands;

use store::AppState;
use database::schema::initialize_database;

use rusqlite::Connection;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("无法打开数据库");
    initialize_database(&conn).expect("数据库初始化失败");

    let app_state = AppState::new(conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::intern_commands::get_interns,
            commands::intern_commands::get_intern,
            commands::intern_commands::create_intern,
            commands::intern_commands::update_intern,
            commands::intern_commands::delete_intern,
            commands::intern_commands::search_interns,
            commands::intern_commands::batch_import_interns,
            commands::intern_commands::update_intern_allocation_status,
            commands::department_commands::get_department_systems,
            commands::department_commands::get_departments,
            commands::department_commands::create_department_system,
            commands::department_commands::update_department_system,
            commands::department_commands::delete_department_system,
            commands::department_commands::create_department,
            commands::department_commands::update_department,
            commands::department_commands::delete_department,
            commands::department_commands::get_total_capacity,
            commands::rotation_commands::pre_allocate_rotation,
            commands::rotation_commands::get_rotation_by_intern,
            commands::rotation_commands::get_rotation_by_month,
            commands::rotation_commands::get_all_current_rotation,
            commands::rotation_commands::manual_adjust_rotation,
            commands::rotation_commands::confirm_allocation,
            commands::rotation_commands::reset_allocation,
            commands::rotation_commands::clean_all_and_repreallocate_rotation,
            commands::rotation_commands::allocate_for_one_intern,
            commands::archive_commands::auto_archive,
            commands::archive_commands::restore_archive,
            commands::archive_commands::get_archived_interns,
            commands::archive_commands::search_archived_interns,
            commands::settings_commands::check_has_password,
            commands::settings_commands::verify_login,
            commands::settings_commands::setup_password,
            commands::settings_commands::change_password,
            commands::settings_commands::get_operation_logs,
            commands::settings_commands::get_log_count,
            commands::report_commands::get_report_interns,
            commands::report_commands::get_report_rotation_all,
            commands::report_commands::get_report_departments,
            commands::report_commands::export_rotation_notice_pdf,
            commands::report_commands::export_rotation_plan_csv,
            commands::report_commands::export_department_detail_csv,
            commands::devtools_command::open_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}

fn get_db_path() -> String {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let app_dir = format!("{}\\.intern-rotation", home);
    std::fs::create_dir_all(&app_dir).ok();
    format!("{}\\data.db", app_dir)
}
