use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeName {
    #[default]
    Gentian,
    Delphinium,
    Camellia,
    Gardenia,
    Iris,
    Dahlia,
    Poppy,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(default)]
pub struct ThemeConfig {
    pub name: ThemeName,
}
