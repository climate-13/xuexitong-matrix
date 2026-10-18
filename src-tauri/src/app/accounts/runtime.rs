use super::*;
use crate::core::url::{classify, Type};
use tauri::{LogicalPosition, LogicalSize, WebviewBuilder, WebviewUrl};

pub fn layout(window: &tauri::Window) -> anyhow::Result<()> {
    let size: LogicalSize<f64> = window.inner_size()?.to_logical(window.scale_factor()?);
    for view in window.webviews() {
        if view.label() == "main" {
            view.set_position(LogicalPosition::new(0.0, 0.0))?;
            view.set_size(size)?;
        }
    }
    Ok(())
}

pub fn create(window: &tauri::Window, account: &Account) -> anyhow::Result<()> {
    let app = window.app_handle().clone();
    let account_id = account.id;
    let testing = std::env::var_os("UXS_MANAGER_TEST_MODE").is_some();
    let url: tauri::Url = account.url.parse()?;
    if !testing && classify(&url) == Type::Unknown { anyhow::bail!("只接受超星平台页面地址"); }
    let target = if testing { WebviewUrl::App(format!("manager-test.html?id={account_id}").into()) } else { WebviewUrl::External(url) };
    let builder = WebviewBuilder::new(label(account_id), target)
        .data_directory(root().join("accounts").join(account_id.to_string()).join("webview"))
        .devtools(cfg!(debug_assertions))
        .initialization_script(include_str!("../../scripts/webview-log.js"))
        .initialization_script_for_all_frames(include_str!("../../scripts/iframe-init.js"))
        .initialization_script_for_all_frames(include_str!("../../scripts/course-list-metadata.js"))
        .initialization_script(include_str!("../../scripts/account-monitor.js"))
        .on_navigation(move |url| classify(url) != Type::Unknown || (testing && url.host_str() == Some("tauri.localhost")))
        .on_page_load(move |view, payload| {
            if let tauri::webview::PageLoadEvent::Started = payload.event() {
                app.state::<Accounts>().prompts.lock().remove(&account_id);
                update(&app, account_id, |a| { a.phase = "加载页面".into(); a.media_seen = false; a.media_advanced = 0.0; });
                return;
            }
            if let tauri::webview::PageLoadEvent::Finished = payload.event() {
                let url_type = classify(payload.url());
                let suspended = app.state::<Accounts>().saved.lock().accounts.iter().find(|a| a.id == account_id).is_some_and(|a| a.suspended);
                let _ = view.eval(format!("window.__UXS_ACCOUNT_SUSPENDED__={suspended};"));
                update(&app, account_id, |a| {
                    a.url = payload.url().to_string();
                    a.phase = if url_type == Type::Login { "待登录" } else if a.running { "运行中" } else if a.suspended { "已停止" } else { "就绪" }.into();
                });
                if let Err(e) = app.state::<Accounts>().save() { log::error!("保存账号页面失败: {e}"); }
                if url_type == Type::Login || is_running(&app, account_id) {
                    if let Some(script) = crate::core::script::obtain(url_type) {
                        if let Err(e) = view.eval(format!("window.__UXS_MANAGER_START__=true;\n{script}")) { update(&app, account_id, |a| { a.phase = "异常".into(); a.detail = e.to_string(); }); }
                    }
                }
            }
        });
    window.add_child(builder, LogicalPosition::new(-12000.0, 0.0), LogicalSize::new(800.0, 600.0))?;
    layout(window)?;
    Ok(())
}

pub fn validate_url(value: &str) -> anyhow::Result<tauri::Url> {
    let url: tauri::Url = value.trim().parse()?;
    if url.scheme() != "https" || classify(&url) == Type::Unknown { anyhow::bail!("请输入 https:// 开头的超星页面地址"); }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_input_rejects_fake_domains_and_non_https() {
        assert!(validate_url("https://mooc1.chaoxing.com/mycourse/studentstudy").is_ok());
        for url in ["https://chaoxing.com.evil.test/", "file:///C:/Windows/", "http://mooc1.chaoxing.com/"] {
            assert!(validate_url(url).is_err());
        }
    }
}
