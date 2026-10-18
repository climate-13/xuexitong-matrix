mod metadata;
mod status;

pub use metadata::{CourseMetaMap, CourseMetadata};
pub use status::CourseStatus;

use super::CommandsResult;

use crate::core::quiz::{llm::AnswerItem, solve};

use tauri::{Emitter, Manager};

#[uxs_commands::command(webview = "chaoxing")]
pub async fn solve_quiz(webview: tauri::Webview, html: String) -> CommandsResult<Vec<AnswerItem>> {
    let id = crate::app::accounts::id(webview.label());
    if let Some(id) = id { crate::app::accounts::update(webview.app_handle(), id, |a| { a.phase = "API 处理中".into(); a.detail = "共享 API 队列处理中".into(); }); }
    match solve(&html).await {
        Ok(answers) => {
            if let Some(id) = id { crate::app::accounts::update(webview.app_handle(), id, |a| { a.phase = "运行中".into(); a.detail = "已收到 API 结果".into(); }); }
            log::info!("solve_quiz 答题成功，获得答案数量: {}", answers.len());
            Ok(answers)
        }
        Err(e) => {
            if let Some(id) = id { crate::app::accounts::update(webview.app_handle(), id, |a| { a.phase = "API 异常".into(); a.detail = e.to_string(); }); }
            log::error!("solve_quiz 答题失败，详细原因: {:?}", e);
            Err(e.into())
        }
    }
}

#[uxs_commands::command(webview = "chaoxing")]
pub fn insert_course_meta_map(
    state: tauri::State<CourseMetaMap>,
    course_id: String,
    metadata: CourseMetadata,
) {
    log::debug!("接收到课程元数据: {:?}", metadata);
    state.insert(course_id, metadata);
}

#[uxs_commands::command]
pub fn query_course_meta(
    state: tauri::State<CourseMetaMap>,
    course_id: String,
) -> Option<CourseMetadata> {
    let metadata = state.get(&course_id);
    if let Some(ref meta) = metadata {
        log::debug!("成功查询到课程元数据: {:?}，ID: {}", meta, course_id);
    } else {
        log::warn!("未查询到课程元数据，课程 ID: {}", course_id);
    }
    metadata
}

#[uxs_commands::command(webview = "chaoxing")]
pub fn send_status(webview: tauri::Webview, status: CourseStatus) -> CommandsResult<()> {
    if let Some(id) = crate::app::accounts::id(webview.label()) {
        crate::app::accounts::stage(webview.app_handle(), id, &status);
        return Ok(());
    }
    log::debug!(
        "接收到来自 [{}] 的章节完成状态: {:?}",
        webview.label(),
        status
    );
    webview.emit_to("main", "status-update", status).ok();
    Ok(())
}

#[uxs_commands::command(webview = "chaoxing")]
pub fn platform() -> CommandsResult<String> {
    Ok(std::env::consts::OS.to_string())
}
