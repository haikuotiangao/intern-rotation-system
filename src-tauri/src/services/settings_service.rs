use rusqlite::Connection;
use crate::database::dao::settings::SettingsDao;
use crate::error::AppError;

pub struct SettingsService;

impl SettingsService {
    pub fn verify_password(conn: &Connection, input: &str) -> Result<bool, AppError> {
        match SettingsDao::get(conn, "password_hash")? {
            Some(hash) => Ok(bcrypt::verify(input, &hash)?),
            None => Ok(false),
        }
    }

    pub fn set_password(conn: &Connection, password: &str) -> Result<(), AppError> {
        let hash = bcrypt::hash(password, 10)?;
        SettingsDao::set(conn, "password_hash", &hash)?;
        Ok(())
    }

    pub fn has_password(conn: &Connection) -> Result<bool, AppError> {
        Ok(SettingsDao::get(conn, "password_hash")?.is_some())
    }
}
