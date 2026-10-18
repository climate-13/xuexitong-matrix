pub mod instance;
pub mod llm;
pub mod options;
pub mod path;
pub mod theme;

use llm::LLMConfig;
use options::OptionsConfig;
use path::PathsConfig;
use theme::ThemeConfig;

use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

#[derive(Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct Config {
    pub version: String,
    pub log_level: log::LevelFilter,
    pub paths: PathsConfig,
    pub options: Mutex<OptionsConfig>,
    pub theme: Mutex<ThemeConfig>,
    pub llm: LLMConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").into(),
            log_level: if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            },
            paths: PathsConfig::default(),
            options: Mutex::new(OptionsConfig::default()),
            theme: Mutex::new(ThemeConfig::default()),
            llm: LLMConfig::default(),
        }
    }
}

impl Config {
    // 此处日志系统尚未初始化完成，读取配置文件失败时将直接降级回退至默认配置。
    fn load() -> Self {
        let config = Self::default();
        // Reuse the first saved window-version configuration on the first manager
        // launch. Browser profiles remain separate; existing files are never overwritten.
        if std::env::var_os("UXS_MANAGER_MODE").is_some()
            && std::env::var_os("UXS_MANAGER_DATA_DIR").is_none()
            && !config.paths.files["config"].exists()
        {
            if let Some(app_root) = crate::config::instance::CURRENT.directory.parent() {
                for number in 1..=32 {
                    let previous = app_root.join("instances").join(number.to_string()).join("config.toml");
                    if previous.exists() {
                        if let Err(e) = std::fs::copy(previous, &config.paths.files["config"]) {
                            eprintln!("旧版配置继承失败: {e}");
                        }
                        break;
                    }
                }
            }
        }
        let mut loaded = Self::parse(
            &std::fs::read_to_string(&config.paths.files["config"]).unwrap_or_default(),
        )
        .unwrap_or(config);
        // Profile selection owns storage paths, including when a saved config is copied.
        loaded.paths = PathsConfig::default();
        loaded
    }

    fn parse(content: &str) -> Result<Self> {
        let mut config: toml::Table = toml::from_str(content)?;
        let metadata = config.remove("metadata");
        let version_changed = config
            .get("version")
            .or_else(|| metadata.as_ref().and_then(|value| value.get("version")))
            .and_then(toml::Value::as_str)
            != Some(env!("CARGO_PKG_VERSION"));
        // 兼容旧 metadata 中的日志级别与版本；未记录版本的配置在首次升级时刷新预设。
        if let Some(level) = metadata.and_then(|value| value.get("logLevel").cloned()) {
            config.entry("log_level").or_insert(level);
        }
        let mut config: Self = config.try_into()?;
        if version_changed {
            let providers = config.llm.providers.get_mut();
            for (id, preset) in LLMConfig::default().providers.into_inner() {
                if let Some(provider) = providers.get_mut(&id)
                    && !provider.is_custom
                {
                    let selected = provider
                        .chosen_model
                        .and_then(|index| provider.models.get(index));
                    provider.chosen_model = selected
                        .and_then(|name| preset.models.iter().position(|model| model == name))
                        .or(preset.chosen_model);
                    provider.models = preset.models;
                }
            }
        }
        config.version = env!("CARGO_PKG_VERSION").into();
        Ok(config)
    }

    pub fn save(&self) -> Result<()> {
        std::fs::write(&self.paths.files["config"], toml::to_string_pretty(&self)?)?;
        log::info!("配置已保存到 {}", self.paths.files["config"].display());
        Ok(())
    }
}

pub static CONFIG: LazyLock<Config> = LazyLock::new(Config::load);

#[cfg(test)]
mod tests {
    use super::Config;

    #[test]
    fn old_metadata_only_migrates_log_level_and_preserves_user_options() {
        let loaded = Config::parse(
            r#"
            [metadata]
            author = "changed"
            title = "changed"
            version = "0.0.0"
            homeUrl = "https://example.com/"
            logLevel = "Warn"
            [options]
            muteWebview = true
        "#,
        )
        .unwrap();
        assert_eq!(loaded.log_level, log::LevelFilter::Warn);
        assert!(loaded.options.lock().mute_webview);
        let saved: toml::Table = toml::from_str(&toml::to_string(&loaded).unwrap()).unwrap();
        assert!(!saved.contains_key("metadata"));
        assert!(saved.contains_key("log_level"));
    }

    #[test]
    fn old_config_without_theme_uses_default_theme() {
        let loaded = Config::parse("[options]\nmuteWebview = true").unwrap();
        assert!(matches!(
            loaded.theme.lock().name,
            super::theme::ThemeName::Gentian
        ));
        assert!(loaded.options.lock().mute_webview);
    }

    #[test]
    fn migration_and_round_trip_preserve_selected_theme() {
        let loaded =
            Config::parse("[metadata]\nlogLevel = 'Warn'\n[theme]\nname = 'iris'").unwrap();
        let saved = toml::to_string_pretty(&loaded).unwrap();
        let reloaded = Config::parse(&saved).unwrap();
        assert!(matches!(
            reloaded.theme.lock().name,
            super::theme::ThemeName::Iris
        ));
        assert_eq!(reloaded.log_level, log::LevelFilter::Warn);
    }

    #[test]
    fn explicit_log_level_takes_precedence_over_old_metadata() {
        let loaded = Config::parse("log_level = 'Error'\n[metadata]\nlogLevel = 'Warn'").unwrap();
        assert_eq!(loaded.log_level, log::LevelFilter::Error);
    }

    #[test]
    fn version_change_refreshes_builtin_models_and_preserves_user_settings() {
        let mut previous = Config {
            version: "2.1.4".into(),
            ..Config::default()
        };
        *previous.llm.active_provider.get_mut() = "deepseek".into();
        let providers = previous.llm.providers.get_mut();
        let provider = providers.get_mut("deepseek").unwrap();
        provider.api_key = Some(super::llm::ApiKey::new("test-api-key-value".into()).unwrap());
        provider.base_url = "https://example.com/chat/completions".into();
        provider.models = vec!["removed-model".into()];
        provider.chosen_model = Some(0);
        let mut custom = provider.clone();
        custom.is_custom = true;
        custom.name = "My Provider".into();
        let custom_value = serde_json::to_value(&custom).unwrap();
        providers.insert("My Provider".into(), custom);
        let original_key = provider_key(&previous, "deepseek");

        let loaded = Config::parse(&toml::to_string(&previous).unwrap()).unwrap();
        assert_eq!(loaded.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(*loaded.llm.active_provider.lock(), "deepseek");
        assert_eq!(provider_key(&loaded, "deepseek"), original_key);
        let presets = super::LLMConfig::default();
        let providers = loaded.llm.providers.lock();
        for (id, preset) in presets.providers.lock().iter() {
            assert_eq!(providers[id].models, preset.models);
            assert_eq!(providers[id].chosen_model, preset.chosen_model);
        }
        assert_eq!(
            providers["deepseek"].base_url,
            "https://example.com/chat/completions"
        );
        assert_eq!(
            serde_json::to_value(&providers["My Provider"]).unwrap(),
            custom_value
        );
        assert_eq!(
            providers["bigmodel"].extra_body,
            presets.providers.lock()["bigmodel"].extra_body
        );
    }

    fn provider_key(config: &Config, id: &str) -> Option<super::llm::ApiKey> {
        config.llm.providers.lock()[id].api_key.clone()
    }

    #[test]
    fn version_change_preserves_selected_model_by_name_after_reordering() {
        let mut previous = Config {
            version: "2.1.4".into(),
            ..Config::default()
        };
        let provider = previous
            .llm
            .providers
            .get_mut()
            .get_mut("bigmodel")
            .unwrap();
        let selected = provider.models[1].clone();
        provider.models = vec![selected.clone()];
        provider.chosen_model = Some(0);

        let loaded = Config::parse(&toml::to_string(&previous).unwrap()).unwrap();
        let providers = loaded.llm.providers.lock();
        let provider = &providers["bigmodel"];
        assert_eq!(provider.models[provider.chosen_model.unwrap()], selected);
        assert_eq!(provider.chosen_model, Some(1));
    }

    #[test]
    fn same_version_and_round_trip_do_not_reset_models() {
        let mut previous = Config::default();
        let provider = previous.llm.providers.get_mut().get_mut("ollama").unwrap();
        provider.models = vec!["local-model".into()];
        provider.chosen_model = Some(0);
        for _ in 0..2 {
            previous = Config::parse(&toml::to_string(&previous).unwrap()).unwrap();
            let providers = previous.llm.providers.lock();
            assert_eq!(providers["ollama"].models, ["local-model"]);
            assert_eq!(providers["ollama"].chosen_model, Some(0));
        }
    }

    #[test]
    fn legacy_and_unversioned_configs_refresh_models() {
        let mut previous = Config::default();
        previous
            .llm
            .providers
            .get_mut()
            .get_mut("bigmodel")
            .unwrap()
            .models = vec!["old-model".into()];
        let mut value: toml::Table = toml::from_str(&toml::to_string(&previous).unwrap()).unwrap();
        value.remove("version");
        let expected = super::LLMConfig::default().providers.lock()["bigmodel"]
            .models
            .clone();
        let unversioned = Config::parse(&toml::to_string(&value).unwrap()).unwrap();
        assert_eq!(
            unversioned.llm.providers.lock()["bigmodel"].models,
            expected
        );

        value.insert(
            "metadata".into(),
            toml::Value::Table(toml::Table::from_iter([(
                "version".into(),
                toml::Value::String("2.1.4".into()),
            )])),
        );
        let legacy = Config::parse(&toml::to_string(&value).unwrap()).unwrap();
        assert_eq!(legacy.llm.providers.lock()["bigmodel"].models, expected);
    }
}
