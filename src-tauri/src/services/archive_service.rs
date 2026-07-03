use rusqlite::Connection;
use crate::database::dao::interns::{Intern, InternDao};
use crate::database::dao::rotation::RotationDao;
use crate::database::dao::logs::{OperationLog, LogDao};
use crate::error::AppError;

pub struct ArchiveService;

impl ArchiveService {
    /// 自动归档已结束的实习生
    pub fn auto_archive(conn: &Connection) -> Result<i32, AppError> {
        let active_interns = InternDao::find_all(conn, Some("active"))?;
        let now = chrono::Utc::now().naive_utc().date();
        let mut archived_count = 0;

        for intern in active_interns {
            let end = match &intern.end_date {
                Some(ed) => chrono::NaiveDate::parse_from_str(ed, "%Y-%m-%d").ok(),
                None => chrono::NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d")
                    .ok().map(|s| s + chrono::Months::new(intern.duration_months as u32)),
            };
            if let Some(end) = end {
                if now >= end {
                    let mut updated = intern.clone();
                    updated.status = "archived".to_string();
                    updated.updated_at = chrono::Utc::now().timestamp();
                    InternDao::update(conn, &updated)?;

                    RotationDao::update_status(conn, &intern.id, "completed")?;

                    let log = OperationLog {
                        id: uuid::Uuid::new_v4().to_string(),
                        operator: "系统".to_string(),
                        action_type: "auto_archive".to_string(),
                        action_detail: format!("实习生 {} 实习结束自动归档", intern.name),
                        created_at: chrono::Utc::now().timestamp(),
                    };
                    LogDao::insert(conn, &log)?;
                    archived_count += 1;
                }
            }
        }
        Ok(archived_count)
    }

    /// 撤销归档
    pub fn restore_from_archive(conn: &Connection, intern_id: &str, operator: &str) -> Result<(), AppError> {
        if let Some(intern) = InternDao::find_by_id(conn, intern_id)? {
            let mut updated = intern.clone();
            updated.status = "active".to_string();
            updated.updated_at = chrono::Utc::now().timestamp();
            InternDao::update(conn, &updated)?;

            let log = OperationLog {
                id: uuid::Uuid::new_v4().to_string(),
                operator: operator.to_string(),
                action_type: "restore_archive".to_string(),
                action_detail: format!("撤销归档: {}", intern.name),
                created_at: chrono::Utc::now().timestamp(),
            };
            LogDao::insert(conn, &log)?;
        }
        Ok(())
    }

    pub fn find_archived(conn: &Connection) -> Result<Vec<Intern>, AppError> {
        InternDao::find_all(conn, Some("archived"))
    }

    pub fn search_archived(conn: &Connection, keyword: &str) -> Result<Vec<Intern>, AppError> {
        InternDao::search(conn, keyword, Some("archived"))
    }
}
