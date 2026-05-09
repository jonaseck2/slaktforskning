// Tauri-spike entry. Wires DB commands. Mirrors the Electron app's IPC
// surface to whatever extent the spike needs to prove end-to-end works.

mod db;

use db::{DbStats, PersonRow};

#[tauri::command]
fn db_open(path: String) -> Result<(), String> {
    db::open_db(&path)
}

#[tauri::command]
fn db_close() {
    db::close_db();
}

#[tauri::command]
fn db_is_open() -> bool {
    db::is_open()
}

#[tauri::command]
fn db_stats() -> Result<DbStats, String> {
    db::db_stats()
}

#[tauri::command]
fn persons_list(limit: u32, offset: u32) -> Result<Vec<PersonRow>, String> {
    db::persons_list(limit, offset)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            db_open,
            db_close,
            db_is_open,
            db_stats,
            persons_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
