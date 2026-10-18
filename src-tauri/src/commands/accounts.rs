use super::CommandsResult;
use crate::app::accounts::{self, Account, Accounts};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Manager, Webview, Window};

#[derive(Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ViewRect { pub id: u32, pub x: f64, pub y: f64, pub width: f64, pub height: f64, pub expanded: bool }

#[uxs_commands::command]
pub fn account_list(app: tauri::AppHandle) -> Vec<Account> {
    app.state::<Accounts>().saved.lock().accounts.clone()
}

#[uxs_commands::command]
pub async fn account_add(window: Window) -> CommandsResult<Account> {
    let account = {
        let state = window.state::<Accounts>();
        let mut saved = state.saved.lock();
        let account = Account::new(saved.next_id);
        saved.next_id = saved.next_id.checked_add(1).ok_or_else(|| anyhow::anyhow!("账号编号已用尽"))?;
        saved.accounts.push(account.clone());
        account
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    let task_window = window.clone();
    let task_account = account.clone();
    window.run_on_main_thread(move || { let _ = tx.send(accounts::runtime::create(&task_window, &task_account)); })?;
    if let Err(e) = rx.await.map_err(|_| anyhow::anyhow!("创建账号视图未完成"))? {
        window.state::<Accounts>().saved.lock().accounts.retain(|a| a.id != account.id);
        return Err(e.into());
    }
    window.state::<Accounts>().save()?;
    Ok(account)
}

#[uxs_commands::command]
pub async fn account_remove(window: Window, id: u32) -> CommandsResult<()> {
    if accounts::is_running(window.app_handle(), id) { return Err(anyhow::anyhow!("请先停止该账号再移除").into()); }
    if let Some(view) = window.get_webview(&accounts::label(id)) { view.close()?; }
    let state = window.state::<Accounts>();
    state.prompts.lock().remove(&id);
    state.bounds.lock().remove(&id);
    state.saved.lock().accounts.retain(|a| a.id != id);
    state.save()?;
    Ok(())
}

#[uxs_commands::command]
pub fn account_rename(app: tauri::AppHandle, id: u32, name: String) -> CommandsResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 { return Err(anyhow::anyhow!("账号备注须为 1–40 个字符").into()); }
    accounts::update(&app, id, |a| a.name = name.into());
    app.state::<Accounts>().save()?;
    Ok(())
}

#[uxs_commands::command]
pub async fn account_navigate(window: Window, id: u32, url: String) -> CommandsResult<()> {
    let url = accounts::runtime::validate_url(&url)?;
    let view = window.get_webview(&accounts::label(id)).ok_or_else(|| anyhow::anyhow!("账号已关闭"))?;
    // Explicit navigation stops the old job before loading another course.
    accounts::update(window.app_handle(), id, |a| { a.running = false; a.suspended = false; a.phase = "加载页面".into(); a.confirmation = None; });
    window.state::<Accounts>().prompts.lock().remove(&id);
    view.navigate(url)?;
    Ok(())
}

#[uxs_commands::command]
pub async fn account_reload(window: Window, id: u32) -> CommandsResult<()> {
    accounts::recovery::reload(&window, id)?;
    Ok(())
}

#[uxs_commands::command]
pub async fn account_run(window: Window, id: u32, running: bool) -> CommandsResult<()> {
    let view = window.get_webview(&accounts::label(id)).ok_or_else(|| anyhow::anyhow!("账号已关闭"))?;
    accounts::update(window.app_handle(), id, |a| {
        a.running = running; a.suspended = !running; a.confirmation = None;
        a.phase = if running { "启动中" } else { "已停止" }.into();
        a.detail = if running { "请确认账号已登录并进入课程页面" } else { "已停止；继续时从平台保存的进度开始" }.into();
    });
    window.state::<Accounts>().prompts.lock().remove(&id);
    view.eval(format!("window.__UXS_ACCOUNT_SUSPENDED__={};", !running))?;
    if running {
        let url = view.url()?;
        if crate::core::url::classify(&url) == crate::core::url::Type::Course {
            view.reload()?;
        } else {
            accounts::update(window.app_handle(), id, |a| { a.phase = "等待选课".into(); a.detail = "请登录并打开要运行的课程".into(); });
        }
    } else {
        view.eval("document.querySelectorAll('video').forEach(v=>v.pause());")?;
        view.reload()?;
    }
    Ok(())
}

#[uxs_commands::command]
pub async fn account_layout(window: Window, rects: Vec<ViewRect>) -> CommandsResult<()> {
    if window.is_minimized()? { return Ok(()); }
    for view in window.webviews() {
        if let Some(id) = accounts::id(view.label()) {
            if let Some(rect) = rects.iter().find(|r| r.id == id && r.width >= 100.0 && r.height >= 80.0) {
                let next = (rect.x, rect.y, rect.width, rect.height, rect.expanded);
                let changed = window.state::<Accounts>().bounds.lock().get(&id).copied() != Some(next);
                if changed {
                    view.set_position(tauri::LogicalPosition::new(rect.x, rect.y))?;
                    view.set_size(tauri::LogicalSize::new(rect.width, rect.height))?;
                    view.set_zoom(if rect.expanded { 0.8 } else { 0.36 })?;
                    window.state::<Accounts>().bounds.lock().insert(id, next);
                }
                view.eval(format!("window.__UXS_TILE_MODE__={};", !rect.expanded))?;
            } else {
                // Keep the viewport alive while cards are scrolled away or a dialog is open.
                if window.state::<Accounts>().bounds.lock().remove(&id).is_some() {
                    view.set_position(tauri::LogicalPosition::new(-12000.0, 0.0))?;
                }
            }
        }
    }
    Ok(())
}

#[uxs_commands::command]
pub fn account_answer(app: tauri::AppHandle, id: u32, accepted: bool) {
    if let Some(sender) = app.state::<Accounts>().prompts.lock().remove(&id) { let _ = sender.send(accepted); }
    accounts::update(&app, id, |a| { a.confirmation = None; a.phase = if a.running { "运行中" } else { "已停止" }.into(); });
}

#[uxs_commands::command(webview = "chaoxing")]
pub fn account_heartbeat(webview: Webview, media_time: f64, media_duration: f64, media_paused: bool, media_seen: bool, online: bool, error: String) {
    let Some(id) = accounts::id(webview.label()) else { return };
    accounts::update(webview.app_handle(), id, |a| {
        if media_seen && (!a.media_seen || media_time > a.media_time + 0.05 || media_time < a.media_time - 1.0) { a.media_advanced = accounts::now(); }
        a.heartbeat = accounts::now(); a.media_time = media_time; a.media_duration = media_duration;
        a.media_paused = media_paused; a.media_seen = media_seen; a.online = online;
        if !online { a.detail = "网络已断开".into(); }
        if !error.is_empty() { a.detail = error; }
    });
}

#[uxs_commands::command]
pub async fn manager_background(window: Window) -> CommandsResult<()> {
    window.minimize()?;
    Ok(())
}
