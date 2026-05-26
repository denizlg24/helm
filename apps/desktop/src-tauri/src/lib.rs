use keyring::Entry;
use serde::Serialize;
use std::fs;

const KEYRING_SERVICE: &str = "com.helm.desktop";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectedFile {
    name: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[tauri::command]
fn keychain_set(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_get(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keychain_delete(key: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn select_files() -> Result<Vec<SelectedFile>, String> {
    let Some(paths) = rfd::FileDialog::new().pick_files() else {
        return Ok(Vec::new());
    };

    paths
        .into_iter()
        .map(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "Selected file has no readable filename".to_string())?
                .to_string();
            let mime_type = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .essence_str()
                .to_string();
            let bytes = fs::read(&path).map_err(|error| error.to_string())?;
            Ok(SelectedFile {
                name,
                mime_type,
                bytes,
            })
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete,
            select_files
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
