//! Pure CLI argument construction, also tested without the platform's Tauri SDK.

pub fn update_args(
    id: String,
    title: Option<String>,
    content: Option<String>,
    tags: Option<String>,
    kind: Option<String>,
    importance: Option<String>,
) -> Vec<String> {
    let mut args = vec!["update".into(), id];
    for (flag, value) in [
        ("--title", title),
        ("--content", content),
        ("--tags", tags),
        ("--kind", kind),
        ("--importance", importance),
    ] {
        if let Some(value) = value {
            args.extend([flag.into(), value]);
        }
    }
    args
}

#[cfg(test)]
mod tests {
    use super::update_args;

    #[test]
    fn importance_changes_both_ways() {
        for importance in ["trivial", "important"] {
            assert_eq!(
                update_args("id".into(), None, None, None, None, Some(importance.into())),
                ["update", "id", "--importance", importance]
            );
        }
    }

    #[test]
    fn omitted_importance_does_not_reset_the_stored_value() {
        assert_eq!(
            update_args("id".into(), Some("renamed".into()), None, None, None, None),
            ["update", "id", "--title", "renamed"]
        );
    }

    #[test]
    fn other_optional_fields_and_explicit_empty_values_are_preserved() {
        assert_eq!(
            update_args("id".into(), Some("title".into()), Some("body".into()),
                Some(String::new()), Some("context".into()), Some("important".into())),
            ["update", "id", "--title", "title", "--content", "body", "--tags", "",
                "--kind", "context", "--importance", "important"]
        );
    }
}
