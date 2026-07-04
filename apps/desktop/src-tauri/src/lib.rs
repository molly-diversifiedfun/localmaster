mod engine;

use std::sync::Mutex;
use tauri::RunEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::EngineHandle(Mutex::new(None)))
        .setup(|app| {
            engine::spawn_engine(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the LocalMaster app")
        .run(|app_handle, event| {
            // Runs once the last window has closed and Tauri is about to
            // exit the process — the one place we're guaranteed to run
            // cleanup exactly once regardless of how the window was closed.
            if let RunEvent::Exit = event {
                engine::shutdown_engine(app_handle);
            }
        });
}
