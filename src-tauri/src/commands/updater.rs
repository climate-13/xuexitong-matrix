use std::sync::Arc;

use anyhow::anyhow;
use serde::Serialize;
use specta::Type;
use tauri::{Emitter, Manager, State, webview::Webview, window::Window};
use tauri_plugin_updater::UpdaterExt;
use tokio::{
    sync::Mutex,
    task::{AbortHandle, JoinHandle},
};

use crate::app::window::prepare_exit;
use crate::commands::CommandsResult;

#[derive(Default)]
pub struct DownloadState(Arc<Mutex<Option<AbortHandle>>>);

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    rid: u32,
    version: String,
    body: Option<String>,
}

/// MSI 安装器写入注册表标记，便携程序不写入。
#[uxs_commands::command]
pub fn is_msi_install(app: tauri::AppHandle) -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};

        let msi = &crate::app::config::CONFIG.msi;
        Some(
            RegKey::predef(HKEY_CURRENT_USER)
                .open_subkey(&msi.keys[&app.config().identifier])
                .and_then(|key| key.get_value::<u32, _>(&msi.value_name))
                .is_ok_and(|value| value == msi.value),
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        None
    }
}

/// 检查更新并将 updater 资源 ID 显式交给前端后续下载或释放。
#[uxs_commands::command]
pub async fn check_update(webview: Webview) -> CommandsResult<Option<UpdateInfo>> {
    if !crate::app::config::CONFIG.update_enabled {
        return Ok(None);
    }
    let update = webview
        .updater_builder()
        .build()
        .map_err(|error| anyhow!(error.to_string()))?
        .check()
        .await
        .map_err(|error| anyhow!(error.to_string()))?;

    Ok(update.map(|update| {
        let version = update.version.clone();
        let body = update.body.clone();
        let rid = webview.resources_table().add(update);
        UpdateInfo { rid, version, body }
    }))
}

/// 下载并安装签名更新包；取消命令会中止正在读取的 HTTP 流。
/// 安装完成返回 true，下载取消返回 false；失败返回错误。
#[uxs_commands::command]
pub async fn download_update(
    webview: Webview,
    window: Window,
    state: State<'_, DownloadState>,
    rid: u32,
) -> CommandsResult<bool> {
    let update = webview
        .resources_table()
        .get::<tauri_plugin_updater::Update>(rid)?;
    let update = (*update).clone();
    let downloads = state.0.clone();
    let task_downloads = downloads.clone();
    let mut active = downloads.lock().await;
    if active.is_some() {
        return Err(anyhow!("更新下载已在进行中").into());
    }
    let mask = window
        .get_webview("mask")
        .ok_or_else(|| anyhow!("未找到遮罩 Webview"))?;
    mask.show()?;
    mask.emit_to("mask", "update-download-start", ())?;

    let download_window = window.clone();
    let task = tokio::spawn(async move {
        let mut downloaded = 0_u64;
        let bytes = update
            .download(
                |chunk_length, total| {
                    downloaded += chunk_length as u64;
                    let _ = download_window.emit_to(
                        "mask",
                        "update-download-progress",
                        serde_json::json!({ "downloaded": downloaded, "total": total }),
                    );
                },
                || {},
            )
            .await
            .map_err(|error| anyhow!(error.to_string()))?;

        task_downloads.lock().await.take();
        prepare_exit(&download_window).await;
        if let Err(error) = update.install(&bytes) {
            let _ = download_window.emit_to("mask", "close-cancelled", ());
            return Err(anyhow!(error.to_string()));
        }
        Ok(())
    });
    *active = Some(task.abort_handle());
    drop(active);

    match finish_download(task, &downloads).await {
        Ok(installed) => Ok(installed),
        Err(error) => {
            let _ = window.emit_to("mask", "update-download-failed", ());
            Err(error.into())
        }
    }
}

async fn finish_download(
    task: JoinHandle<anyhow::Result<()>>,
    downloads: &Mutex<Option<AbortHandle>>,
) -> anyhow::Result<bool> {
    let task_id = task.id();
    let result = task.await;
    let mut active = downloads.lock().await;
    // Cancellation frees the slot before this join finishes; a newer download may already own it.
    if active
        .as_ref()
        .is_some_and(|download| download.id() == task_id)
    {
        active.take();
    }
    match result {
        Ok(result) => result.map(|()| true),
        Err(error) if error.is_cancelled() => Ok(false),
        Err(error) => Err(anyhow!(error)),
    }
}

/// 取消仍处于下载阶段的更新任务；进入安装阶段后返回 false。
#[uxs_commands::command(webview = "mask")]
pub async fn cancel_update_download(state: State<'_, DownloadState>) -> CommandsResult<bool> {
    let Some(download) = state.0.lock().await.take() else {
        return Ok(false);
    };
    download.abort();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::finish_download;
    use anyhow::anyhow;
    use tokio::sync::Mutex;

    #[tokio::test]
    async fn failed_download_releases_the_slot_for_retry() {
        let downloads = Mutex::new(None);
        let failed = tokio::spawn(async { Err(anyhow!("download or signature failure")) });
        *downloads.lock().await = Some(failed.abort_handle());
        assert!(finish_download(failed, &downloads).await.is_err());
        assert!(downloads.lock().await.is_none());

        let retry = tokio::spawn(async { Ok(()) });
        *downloads.lock().await = Some(retry.abort_handle());
        assert!(finish_download(retry, &downloads).await.unwrap());
        assert!(downloads.lock().await.is_none());
    }

    #[tokio::test]
    async fn cancelled_download_does_not_clear_a_newer_download() {
        let downloads = Mutex::new(None);
        let cancelled = tokio::spawn(std::future::pending::<anyhow::Result<()>>());
        *downloads.lock().await = Some(cancelled.abort_handle());
        downloads.lock().await.take().unwrap().abort();

        let newer = tokio::spawn(std::future::pending::<anyhow::Result<()>>());
        let newer_id = newer.id();
        *downloads.lock().await = Some(newer.abort_handle());
        assert!(!finish_download(cancelled, &downloads).await.unwrap());
        assert_eq!(downloads.lock().await.as_ref().unwrap().id(), newer_id);

        downloads.lock().await.take().unwrap().abort();
        assert!(!finish_download(newer, &downloads).await.unwrap());
        assert!(downloads.lock().await.is_none());
    }
}
