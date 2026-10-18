use std::{
    fs::{File, OpenOptions},
    io,
    path::PathBuf,
    sync::LazyLock,
};

pub struct Instance {
    pub number: u32,
    pub directory: PathBuf,
    // The OS releases this lock even if the process crashes; saved profiles can be reused.
    _lock: File,
}

impl Instance {
    fn acquire(root: PathBuf) -> io::Result<Self> {
        for number in 1..=32 {
            let directory = root.join(number.to_string());
            std::fs::create_dir_all(&directory)?;
            let lock = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(directory.join("instance.lock"))?;
            match lock.try_lock() {
                Ok(()) => {
                    return Ok(Self {
                        number,
                        directory,
                        _lock: lock,
                    });
                }
                Err(std::fs::TryLockError::WouldBlock) => continue,
                Err(std::fs::TryLockError::Error(error)) => return Err(error),
            }
        }
        Err(io::Error::other("最多同时运行 32 个实例，请先关闭一个窗口"))
    }
}

pub static CURRENT: LazyLock<Instance> = LazyLock::new(|| {
    if std::env::var_os("UXS_MANAGER_MODE").is_some() {
        let directory = std::env::var_os("UXS_MANAGER_DATA_DIR").map(PathBuf::from).unwrap_or_else(|| {
            dirs::data_dir().unwrap_or_else(|| PathBuf::from("uxs-data"))
                .join(super::path::app_identifier()).join("manager")
        });
        std::fs::create_dir_all(&directory).expect("无法创建管理器资料目录");
        let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false)
            .open(directory.join("manager.lock")).expect("无法打开管理器锁");
        lock.try_lock().expect("管理器已打开，请从任务栏恢复现有窗口");
        return Instance { number: 0, directory, _lock: lock };
    }
    let root = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("uxs-data"))
        .join(super::path::app_identifier())
        .join("instances");
    Instance::acquire(root).expect("无法分配独立实例目录")
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_instances_are_isolated_and_closed_slots_are_reusable() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../target")
            .join(format!("instance-test-{}", std::process::id()));
        let first = Instance::acquire(root.clone()).unwrap();
        let second = Instance::acquire(root.clone()).unwrap();
        assert_eq!(first.number, 1);
        assert_eq!(second.number, 2);
        assert_ne!(first.directory, second.directory);
        drop(first);
        let reopened = Instance::acquire(root.clone()).unwrap();
        assert_eq!(reopened.number, 1);
        drop((second, reopened));
        for number in 1..=2 {
            let directory = root.join(number.to_string());
            std::fs::remove_file(directory.join("instance.lock")).unwrap();
            std::fs::remove_dir(directory).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}
