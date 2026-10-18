use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default, Debug, Clone, Type)]
pub struct CourseMetadata {
    pub title: String,
    pub cover: String,
}

#[derive(Default, Debug)]
pub struct CourseMetaMap(Mutex<HashMap<String, CourseMetadata>>);

impl CourseMetaMap {
    pub fn insert(&self, course_id: String, metadata: CourseMetadata) {
        self.0.lock().insert(course_id, metadata);
    }

    pub fn get(&self, course_id: &str) -> Option<CourseMetadata> {
        self.0.lock().get(course_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metadata(title: &str, cover: &str) -> CourseMetadata {
        CourseMetadata {
            title: title.into(),
            cover: cover.into(),
        }
    }

    #[test]
    fn returns_none_for_an_unknown_course() {
        let map = CourseMetaMap::default();

        assert!(map.get("missing-course").is_none());
    }

    #[test]
    fn stores_and_overwrites_course_metadata() {
        let map = CourseMetaMap::default();

        map.insert("course-1".into(), metadata("First title", "first.png"));
        let first = map.get("course-1").expect("metadata should be stored");
        assert_eq!(first.title, "First title");
        assert_eq!(first.cover, "first.png");

        map.insert("course-1".into(), metadata("Updated title", "updated.png"));
        let updated = map
            .get("course-1")
            .expect("updated metadata should be stored");
        assert_eq!(updated.title, "Updated title");
        assert_eq!(updated.cover, "updated.png");
    }

    #[test]
    fn keeps_metadata_for_different_courses_isolated() {
        let map = CourseMetaMap::default();

        map.insert("course-1".into(), metadata("First", "first.png"));
        map.insert("course-2".into(), metadata("Second", "second.png"));

        assert_eq!(map.get("course-1").expect("course-1 exists").title, "First");
        assert_eq!(
            map.get("course-2").expect("course-2 exists").title,
            "Second"
        );
    }
}
