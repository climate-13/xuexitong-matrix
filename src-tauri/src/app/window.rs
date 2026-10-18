use crate::{app::{accounts, webview}, config::CONFIG};
use tauri::{image::Image, LogicalSize, Manager, WindowBuilder, WindowEvent, window::Window};

pub async fn prepare_exit(window: &Window) {
    if let Err(e) = CONFIG.save() { log::error!("保存共享配置失败: {e}"); }
    if let Err(e) = window.state::<accounts::Accounts>().save() { log::error!("保存账号列表失败: {e}"); }
}

pub fn listener(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let window = window.clone();
            tauri::async_runtime::spawn(async move {
                prepare_exit(&window).await;
                let _ = window.destroy();
            });
        }
        WindowEvent::Resized(size) if size.width > 0 && size.height > 0 && !window.is_minimized().unwrap_or(false) => {
            if let Err(e) = accounts::runtime::layout(window) { log::error!("调整控制台布局失败: {e}"); }
        }
        _ => {}
    }
}

pub fn init(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let monitor = app.primary_monitor()?.ok_or("没有可用显示器")?;
    let size: LogicalSize<f64> = monitor.size().to_logical(monitor.scale_factor());
    let window = WindowBuilder::new(app, "app")
        .title(app.config().product_name.as_deref().unwrap_or("SK Matrix"))
        .inner_size((size.width * 0.9).min(1600.0), (size.height * 0.88).min(1000.0))
        .min_inner_size(1000.0, 680.0).center().resizable(true).maximizable(true)
        .background_color((245, 245, 243).into())
        .icon(Image::from_bytes(include_bytes!("../../icons/icon.ico"))?)?
        .build()?;
    accounts::recovery::install_menu(&window)?;
    webview::init_on(&window, "main")?;
    let saved = app.state::<accounts::Accounts>().saved.lock().accounts.clone();
    for account in saved {
        if let Err(e) = accounts::runtime::create(&window, &account) {
            accounts::update(app.handle(), account.id, |a| { a.phase = "异常".into(); a.detail = e.to_string(); });
        }
    }
    keep_awake(app.handle().clone());
    log::info!("多账号控制台已启动；资料目录: {}", accounts::root().display());
    Ok(())
}

fn keep_awake(app: tauri::AppHandle) {
    // Execution state belongs to the calling thread. Preserve it on one worker
    // while tasks run; the display may still switch off.
    #[cfg(windows)]
    std::thread::spawn(move || {
        #[link(name = "kernel32")]
        unsafe extern "system" { fn SetThreadExecutionState(flags: u32) -> u32; }
        loop {
            let active = app.state::<accounts::Accounts>().saved.lock().accounts.iter().any(|a| a.running);
            let flags = 0x80000000 | if active { 0x00000001 } else { 0 };
            if unsafe { SetThreadExecutionState(flags) } == 0 { log::warn!("Windows 未接受防自动休眠请求"); }
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
    });
}
