use keyring::Entry;
use serde::Serialize;
use std::fs;

const KEYRING_SERVICE: &str = "com.helm.desktop";
const MAX_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024; // 100 MB
const MAX_TOTAL_SELECTION_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

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

    let mut total_bytes_read: u64 = 0;
    let mut result = Vec::new();

    for path in paths {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Selected file has no readable filename".to_string())?
            .to_string();
        let mime_type = mime_guess::from_path(&path)
            .first_or_octet_stream()
            .essence_str()
            .to_string();
        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        let file_size = metadata.len();

        if file_size > MAX_FILE_SIZE_BYTES {
            return Err(format!(
                "File '{}' exceeds maximum size of {} MB",
                name,
                MAX_FILE_SIZE_BYTES / (1024 * 1024)
            ));
        }

        if total_bytes_read + file_size > MAX_TOTAL_SELECTION_BYTES {
            return Err(format!(
                "Total selection size would exceed maximum of {} MB (file '{}' cannot be added)",
                MAX_TOTAL_SELECTION_BYTES / (1024 * 1024),
                name
            ));
        }

        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        total_bytes_read += file_size;

        result.push(SelectedFile {
            name,
            mime_type,
            bytes,
        });
    }

    Ok(result)
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
