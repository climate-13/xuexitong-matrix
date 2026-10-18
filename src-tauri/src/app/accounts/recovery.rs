use super::{Accounts, label, update};
use tauri::{Emitter, Manager};

// Recovery uses the native WebView, so a stalled course renderer cannot block it.
// Reuse the same view and data directory; never delete cookies or account files.
pub fn reload(window: &tauri::Window, id: u32) -> anyhow::Result<()> {
    let view = window.get_webview(&label(id)).ok_or_else(|| anyhow::anyhow!("账号已关闭"))?;
    view.reload()?;
    window.state::<Accounts>().prompts.lock().remove(&id);
    update(window.app_handle(), id, |a| {
        a.confirmation = None;
        a.media_seen = false;
        a.phase = "重新加载".into();
        a.detail = "正在重载页面，保留当前账号登录资料".into();
    });
    Ok(())
}

pub fn overview(window: &tauri::Window) -> anyhow::Result<()> {
    window.set_fullscreen(false)?;
    for view in window.webviews() {
        if super::id(view.label()).is_some() {
            view.set_position(tauri::LogicalPosition::new(-12000.0, 0.0))?;
        }
    }
    window.state::<Accounts>().bounds.lock().clear();
    window.emit_to("main", "manager-overview", ())?;
    if let Some(main) = window.get_webview("main") { main.set_focus()?; }
    Ok(())
}

pub fn install_menu(window: &tauri::Window) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, Submenu};
    let back = MenuItem::with_id(window, "recover-overview", "返回账号拼盘", true, None::<&str>)?;
    let reload = MenuItem::with_id(window, "recover-reload", "重新加载展开的账号", true, None::<&str>)?;
    let submenu = Submenu::with_items(window, "页面恢复", true, &[&back, &reload])?;
    window.set_menu(Menu::with_items(window, &[&submenu])?)?;
    window.on_menu_event(|window, event| {
        let result = match event.id().as_ref() {
            "recover-overview" => overview(window),
            "recover-reload" => {
                let id = window.state::<Accounts>().bounds.lock().iter().find(|(_, rect)| rect.4).map(|(id, _)| *id);
                match id {
                    Some(id) => self::reload(window, id),
                    None => window.emit_to("main", "manager-recovery-error", "请先展开需要重载的账号，或使用卡片上的重载按钮").map_err(Into::into),
                }
            }
            _ => return,
        };
        if let Err(error) = result {
            log::error!("页面恢复失败: {error}");
            let _ = window.emit_to("main", "manager-recovery-error", error.to_string());
        }
    });
    Ok(())
}
