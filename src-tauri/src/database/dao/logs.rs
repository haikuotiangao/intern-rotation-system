use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OperationLog {
    pub id: String,
    pub operator: String,
    pub action_type: String,
    pub action_detail: String,
    pub created_at: i64,
}

pub struct LogDao;

impl LogDao {
    pub fn insert(conn: &Connection, log: &OperationLog) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO operation_logs (id, operator, action_type, action_detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![log.id, log.operator, log.action_type, log.action_detail, log.created_at],
        )?;
        Ok(())
    }

    pub fn find_all(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<OperationLog>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, operator, action_type, action_detail, created_at FROM operation_logs ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(OperationLog {
                id: row.get(0)?, operator: row.get(1)?, action_type: row.get(2)?,
                action_detail: row.get(3)?, created_at: row.get(4)?,
            })
        })?;
        let mut logs = Vec::new();
        for row in rows { logs.push(row?); }
        Ok(logs)
    }

    pub fn find_by_type(conn: &Connection, action_type: &str, limit: i64, offset: i64) -> Result<Vec<OperationLog>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, operator, action_type, action_detail, created_at FROM operation_logs
             WHERE action_type=?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
        )?;
        let rows = stmt.query_map(params![action_type, limit, offset], |row| {
            Ok(OperationLog {
                id: row.get(0)?, operator: row.get(1)?, action_type: row.get(2)?,
                action_detail: row.get(3)?, created_at: row.get(4)?,
            })
        })?;
        let mut logs = Vec::new();
        for row in rows { logs.push(row?); }
        Ok(logs)
    }

    pub fn count(conn: &Connection) -> Result<i64, AppError> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM operation_logs", [], |row| row.get(0))?;
        Ok(count)
    }
}
