use rusqlite::Connection;
use crate::error::AppError;

pub struct SettingsDao;

#[allow(dead_code)]
impl SettingsDao {
    pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key=?1")?;
        let mut rows = stmt.query_map([key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(Ok(val)) => Ok(Some(val)),
            _ => Ok(None),
        }
    }

    pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    pub fn get_i64(conn: &Connection, key: &str, default: i64) -> Result<i64, AppError> {
        match Self::get(conn, key)? {
            Some(val) => val.parse::<i64>().or(Ok(default)),
            None => Ok(default),
        }
    }

    pub fn get_bool(conn: &Connection, key: &str, default: bool) -> Result<bool, AppError> {
        match Self::get(conn, key)? {
            Some(val) => Ok(val == "true" || val == "1"),
            None => Ok(default),
        }
    }
}
