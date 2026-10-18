pub mod runtime;
pub mod recovery;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{collections::HashMap, path::PathBuf};
use tauri::{Emitter, Manager};

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: u32,
    pub name: String,
    pub url: String,
    #[serde(default)] pub running: bool,
    #[serde(default)] pub suspended: bool,
    #[serde(default)] pub phase: String,
    #[serde(default)] pub chapter: String,
    #[serde(default)] pub completed: i32,
    #[serde(default)] pub total: i32,
    #[serde(default)] pub task: String,
    #[serde(default)] pub detail: String,
    #[serde(default)] pub heartbeat: f64,
    #[serde(default)] pub media_time: f64,
    #[serde(default)] pub media_duration: f64,
    #[serde(default)] pub media_paused: bool,
    #[serde(default)] pub media_seen: bool,
    #[serde(default)] pub media_advanced: f64,
    #[serde(default)] pub online: bool,
    #[serde(default)] pub confirmation: Option<String>,
}

impl Account {
    pub fn new(id: u32) -> Self {
        Self { id, name: format!("账号 {id:02}"), url: crate::app::config::CONFIG.home_url.to_string(),
            running: false, suspended: false, phase: "待登录".into(), chapter: String::new(), completed: 0, total: 0,
            task: String::new(), detail: "打开页面登录，然后进入课程并点击开始".into(),
            heartbeat: 0.0, media_time: 0.0, media_duration: 0.0, media_paused: true,
            media_seen: false, media_advanced: 0.0, online: true, confirmation: None }
    }
}

#[derive(Default, Serialize, Deserialize)]
pub struct SavedAccounts { pub next_id: u32, pub accounts: Vec<Account> }

pub struct Accounts {
    persist: Mutex<()>,
    pub bounds: Mutex<HashMap<u32, (f64, f64, f64, f64, bool)>>,
    pub saved: Mutex<SavedAccounts>,
    pub prompts: Mutex<HashMap<u32, tokio::sync::oneshot::Sender<bool>>>,
}

pub fn root() -> PathBuf { crate::config::instance::CURRENT.directory.clone() }
pub fn label(id: u32) -> String { format!("chaoxing-{id}") }
pub fn id(label: &str) -> Option<u32> { label.strip_prefix("chaoxing-")?.parse().ok() }
pub fn now() -> f64 { chrono::Utc::now().timestamp_millis() as f64 }

impl Default for Accounts {
    fn default() -> Self {
        let path = root().join("accounts.json");
        let mut saved: SavedAccounts = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).expect("账号列表损坏；请备份 accounts.json 后检查"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => SavedAccounts::default(),
            Err(e) => panic!("无法读取账号列表: {e}"),
        };
        for a in &mut saved.accounts {
            a.running = false; a.suspended = true; a.phase = "已停止".into(); a.detail = "登录资料已保留，点击开始继续".into();
            a.heartbeat = 0.0; a.media_seen = false; a.media_advanced = 0.0; a.confirmation = None;
        }
        saved.next_id = saved.next_id.max(saved.accounts.iter().map(|a| a.id).max().unwrap_or(0) + 1);
        Self { persist: Mutex::new(()), bounds: Mutex::new(HashMap::new()), saved: Mutex::new(saved), prompts: Mutex::new(HashMap::new()) }
    }
}

impl Accounts {
    pub fn save(&self) -> anyhow::Result<()> {
        let _persist = self.persist.lock();
        let bytes = serde_json::to_vec_pretty(&*self.saved.lock())?;
        let temp = root().join("accounts.json.tmp");
        std::fs::write(&temp, bytes)?;
        std::fs::rename(temp, root().join("accounts.json"))?;
        Ok(())
    }
}

pub fn update(app: &tauri::AppHandle, id: u32, change: impl FnOnce(&mut Account)) {
    let state = app.state::<Accounts>();
    let mut saved = state.saved.lock();
    if let Some(a) = saved.accounts.iter_mut().find(|a| a.id == id) {
        change(a);
        let _ = app.emit_to("main", "account-update", a.clone());
    }
}

pub fn is_running(app: &tauri::AppHandle, id: u32) -> bool {
    app.state::<Accounts>().saved.lock().accounts.iter().any(|a| a.id == id && a.running)
}

pub fn stage(app: &tauri::AppHandle, id: u32, status: &crate::commands::chaoxing::CourseStatus) {
    use crate::commands::chaoxing::CourseStatus::*;
    update(app, id, |a| match status {
        Start(_) => { a.phase = "运行中".into(); a.detail = "正在扫描课程任务".into(); }
        Chapter(p) => { a.chapter = p.title.clone(); a.completed = p.completed; a.total = p.total; a.phase = "运行中".into(); }
        Tab(p) => a.detail = format!("页签 {} / {}", p.index + 1, p.total),
        Task(p) => { a.task = format!("{} · 任务 {}", p.category, p.index + 1); a.phase = "运行中".into(); }
        Finish(_) => { a.running = false; a.phase = "遍历结束".into(); a.detail = "脚本遍历结束；完成情况以平台记录为准".into(); }
        Cancel(_) => { a.running = false; a.phase = "已停止".into(); }
        Waiting(_) => a.phase = "等待页面".into(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_labels_do_not_alias_and_round_trip() {
        assert_eq!(id(&label(159)), Some(159));
        assert_eq!(id("main"), None);
        assert_eq!(id("chaoxing-mask"), None);
        assert_ne!(label(1), label(11));
    }
}
