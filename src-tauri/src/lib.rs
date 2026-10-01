use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use window_vibrancy::{apply_blur, apply_vibrancy, NSVisualEffectMaterial};

fn app_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join("Documents").join("cv-editor")
}

#[tauri::command]
fn get_app_dir() -> String {
    app_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn init_app_dir() -> Result<(), String> {
    let dir = app_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let templates_dir = dir.join("templates");
    if !templates_dir.exists() {
        fs::create_dir_all(&templates_dir).map_err(|e| e.to_string())?;

        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let bundled = std::path::Path::new(manifest_dir)
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("templates");

        if let Ok(entries) = fs::read_dir(&bundled) {
            for entry in entries.flatten() {
                let src = entry.path();
                let dst = templates_dir.join(entry.file_name());
                let _ = fs::copy(src, dst);
            }
        }
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Default)]
struct AppState {
    last_project: Option<String>,
}

#[tauri::command]
fn get_last_project() -> Option<String> {
    let content = fs::read_to_string(app_dir().join("state.json")).ok()?;
    let state: AppState = serde_json::from_str(&content).ok()?;
    state.last_project
}

#[tauri::command]
fn set_last_project(name: String) -> Result<(), String> {
    let state = AppState { last_project: Some(name) };
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(app_dir().join("state.json"), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects() -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(app_dir())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.is_dir() {
                let name = path.file_name()?.to_str()?.to_string();
                if name != "templates" { Some(name) } else { None }
            } else {
                None
            }
        })
        .collect();
    names.sort();
    names
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContactInfo {
    #[serde(default)]
    id: String,
    kind: String,
    #[serde(default)]
    label: String,
    value: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Education {
    #[serde(default)]
    id: String,
    institution: String,
    #[serde(default)]
    degree: String,
    #[serde(default)]
    field_of_study: String,
    #[serde(default)]
    start_date: String,
    #[serde(default)]
    end_date: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UserProfile {
    id: String,
    full_name: String,
    headline: String,
    summary: String,
    contacts: Vec<ContactInfo>,
    education: Vec<Education>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileInput {
    full_name: String,
    #[serde(default)]
    headline: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    contacts: Vec<ContactInfo>,
    #[serde(default)]
    education: Vec<Education>,
}

fn profiles_path() -> PathBuf { app_dir().join("profiles.json") }

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_profiles() -> Vec<UserProfile> {
    fs::read_to_string(profiles_path())
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_profiles(profiles: &[UserProfile]) -> Result<(), String> {
    fs::create_dir_all(app_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(profiles).map_err(|e| e.to_string())?;
    let temporary = app_dir().join("profiles.json.tmp");
    fs::write(&temporary, json).map_err(|e| e.to_string())?;
    fs::rename(temporary, profiles_path()).map_err(|e| e.to_string())
}

fn normalize_profile_input(input: ProfileInput, profile_id: &str) -> Result<ProfileInput, String> {
    let full_name = input.full_name.trim().to_string();
    if full_name.is_empty() || full_name.chars().count() > 120 {
        return Err("full name must contain 1 to 120 characters".into());
    }
    let valid_kinds = ["phone", "email", "address", "social"];
    let mut contacts = input.contacts;
    for (index, contact) in contacts.iter_mut().enumerate() {
        contact.kind = contact.kind.trim().to_lowercase();
        contact.label = contact.label.trim().to_string();
        contact.value = contact.value.trim().to_string();
        if !valid_kinds.contains(&contact.kind.as_str()) { return Err("invalid contact kind".into()); }
        if contact.value.is_empty() { return Err("contact value cannot be empty".into()); }
        if contact.id.is_empty() { contact.id = format!("{}-contact-{}", profile_id, index + 1); }
    }
    let mut education = input.education;
    for (index, item) in education.iter_mut().enumerate() {
        item.institution = item.institution.trim().to_string();
        if item.institution.is_empty() { return Err("education institution cannot be empty".into()); }
        if item.id.is_empty() { item.id = format!("{}-education-{}", profile_id, index + 1); }
    }
    Ok(ProfileInput {
        full_name,
        headline: input.headline.trim().to_string(),
        summary: input.summary.trim().to_string(),
        contacts,
        education,
    })
}

#[tauri::command]
fn list_profiles() -> Vec<UserProfile> {
    let mut profiles = read_profiles();
    profiles.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    profiles
}

#[tauri::command]
fn create_profile(profile: ProfileInput) -> Result<UserProfile, String> {
    let now = now_millis();
    let mut profiles = read_profiles();
    let mut id = format!("profile-{}", now);
    let mut suffix = 2;
    while profiles.iter().any(|profile| profile.id == id) {
        id = format!("profile-{}-{}", now, suffix);
        suffix += 1;
    }
    let input = normalize_profile_input(profile, &id)?;
    let created = UserProfile {
        id,
        full_name: input.full_name,
        headline: input.headline,
        summary: input.summary,
        contacts: input.contacts,
        education: input.education,
        created_at: now,
        updated_at: now,
    };
    profiles.push(created.clone());
    write_profiles(&profiles)?;
    Ok(created)
}

#[tauri::command]
fn update_profile(id: String, profile: ProfileInput) -> Result<UserProfile, String> {
    let input = normalize_profile_input(profile, &id)?;
    let mut profiles = read_profiles();
    let existing = profiles.iter_mut().find(|item| item.id == id).ok_or("profile not found")?;
    existing.full_name = input.full_name;
    existing.headline = input.headline;
    existing.summary = input.summary;
    existing.contacts = input.contacts;
    existing.education = input.education;
    existing.updated_at = now_millis();
    let updated = existing.clone();
    write_profiles(&profiles)?;
    Ok(updated)
}

#[tauri::command]
fn delete_profile(id: String) -> Result<(), String> {
    let mut profiles = read_profiles();
    let previous_len = profiles.len();
    profiles.retain(|profile| profile.id != id);
    if profiles.len() == previous_len { return Err("profile not found".into()); }
    write_profiles(&profiles)
}

#[derive(Serialize)]
struct ProjectData {
    md: String,
    css: String,
}

#[tauri::command]
fn open_project(name: String) -> Result<ProjectData, String> {
    let dir = app_dir().join(&name);
    let md = fs::read_to_string(dir.join("content.md")).map_err(|e| e.to_string())?;
    let css = fs::read_to_string(dir.join("style.css")).unwrap_or_default();
    Ok(ProjectData { md, css })
}

#[tauri::command]
fn save_project(name: String, md: String, css: String) -> Result<(), String> {
    let dir = app_dir().join(&name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("content.md"), md).map_err(|e| e.to_string())?;
    fs::write(dir.join("style.css"), css).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct OpenedFile {
    md: String,
    css: String,
    project_name: String,
}

#[tauri::command]
fn open_file(md_path: String) -> Result<OpenedFile, String> {
    let path = std::path::Path::new(&md_path);
    let dir  = path.parent().ok_or("invalid path")?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("content");

    let md = fs::read_to_string(path).map_err(|e| e.to_string())?;

    let css = fs::read_to_string(dir.join(format!("{}.css", stem)))
        .or_else(|_| fs::read_to_string(dir.join("style.css")))
        .unwrap_or_default();

    let project_name = if stem == "content" {
        dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(stem)
            .to_string()
    } else {
        stem.to_string()
    };

    Ok(OpenedFile { md, css, project_name })
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_template_path(name: String) -> String {
    let app_tpl = app_dir().join("templates").join(&name);
    if app_tpl.exists() {
        return app_tpl.to_string_lossy().to_string();
    }
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    std::path::Path::new(manifest_dir)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("templates")
        .join(&name)
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn list_templates() -> Vec<String> {
    let app_tpl = app_dir().join("templates");
    let dir = if app_tpl.exists() {
        app_tpl
    } else {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        std::path::Path::new(manifest_dir)
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("templates")
    };

    let mut names: Vec<String> = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension()?.to_str()? == "md" {
                Some(path.file_stem()?.to_str()?.to_string())
            } else {
                None
            }
        })
        .collect();
    names.sort();
    names
}

// ── macOS native PDF export via WKWebView.createPDF ─────────────────────────
#[cfg(target_os = "macos")]
extern "C" {
    fn html_to_pdf(html: *const std::ffi::c_char, path: *const std::ffi::c_char) -> std::ffi::c_int;
}

#[tauri::command]
async fn export_pdf_native(app: tauri::AppHandle, html: String, path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;
        use std::sync::mpsc;

        let html_c = CString::new(html).map_err(|e| e.to_string())?;
        let path_c = CString::new(path).map_err(|e| e.to_string())?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        app.run_on_main_thread(move || {
            let rc = unsafe { html_to_pdf(html_c.as_ptr(), path_c.as_ptr()) };
            let _ = tx.send(if rc == 0 { Ok(()) } else { Err("PDF rendering failed".to_string()) });
        }).map_err(|e| e.to_string())?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv().map_err(|_| "PDF export channel closed".to_string())?
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    Err("Native PDF export is only supported on macOS".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            apply_blur(&window, Some((18, 18, 18, 125)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_app_dir,
            init_app_dir,
            get_last_project,
            set_last_project,
            list_projects,
            open_project,
            save_project,
            read_file,
            write_file,
            write_binary_file,
            open_file,
            get_template_path,
            list_templates,
            list_profiles,
            create_profile,
            update_profile,
            delete_profile,
            export_pdf_native,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
