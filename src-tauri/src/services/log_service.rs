use rusqlite::Connection;
use crate::database::dao::logs::{OperationLog, LogDao};
use crate::error::AppError;

pub struct LogService;

impl LogService {
    pub fn get_logs(conn: &Connection, page: i64, page_size: i64, action_type: Option<&str>) -> Result<Vec<OperationLog>, AppError> {
        let offset = (page - 1) * page_size;
        match action_type {
            Some(t) => LogDao::find_by_type(conn, t, page_size, offset),
            None => LogDao::find_all(conn, page_size, offset),
        }
    }

    pub fn get_log_count(conn: &Connection) -> Result<i64, AppError> {
        LogDao::count(conn)
    }
}
