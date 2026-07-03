use tauri::{AppHandle, Manager};

/// 打开 DevTools (F12/Ctrl+Shift+I 触发)
#[tauri::command]
pub fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.open_devtools();
        Ok(())
    } else {
        Err("main webview window not found".to_string())
    }
}
