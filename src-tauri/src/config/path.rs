use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Deserialize)]
struct TauriConfig {
    identifier: String,
}

pub(super) fn app_identifier() -> String {
    serde_json::from_str::<TauriConfig>(include_str!("../../tauri.conf.json"))
        .expect("无法解析 tauri.conf.json")
        .identifier
}

#[derive(Serialize, Deserialize, Debug, Clone, specta::Type)]
#[serde(default)]
pub struct PathsConfig {
    pub dirs: HashMap<String, PathBuf>,
    pub files: HashMap<String, PathBuf>,
}

impl Default for PathsConfig {
    fn default() -> Self {
        let data_dir = super::instance::CURRENT.directory.clone();

        Self {
            dirs: HashMap::from([
                ("data".into(), data_dir.clone()),
                ("logs".into(), data_dir.join("logs")),
            ]),
            files: HashMap::from([("config".into(), data_dir.join("config.toml"))]),
        }
    }
}

impl PathsConfig {
    pub fn ensure(&self) -> std::io::Result<()> {
        // 只创建必要目录，避免生成 0 字节空配置文件
        for dir in self.dirs.values() {
            std::fs::create_dir_all(dir)?;
        }
        Ok(())
    }
}
