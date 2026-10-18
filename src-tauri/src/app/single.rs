/// Reopening the normal Windows build brings the existing console forward.
/// The profile lock remains the authority for concurrent startup races.
pub fn restore_existing() -> bool {
    if std::env::var_os("UXS_MANAGER_TEST_MODE").is_some() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        #[link(name = "user32")]
        unsafe extern "system" {
            fn FindWindowW(class: *const u16, title: *const u16) -> *mut c_void;
            fn ShowWindow(window: *mut c_void, command: i32) -> i32;
            fn SetForegroundWindow(window: *mut c_void) -> i32;
        }
        let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
            .expect("Invalid application configuration");
        let title = config["productName"].as_str().unwrap_or("SK Matrix");
        let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let window = unsafe { FindWindowW(std::ptr::null(), wide.as_ptr()) };
        if !window.is_null() {
            unsafe { ShowWindow(window, 9); SetForegroundWindow(window); }
            return true;
        }
    }
    false
}
