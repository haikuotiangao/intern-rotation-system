use rusqlite::Connection;
use crate::database::dao::departments::{Department, DepartmentSystem, DepartmentWithSystem, DepartmentDao};
use crate::database::dao::logs::{OperationLog, LogDao};
use crate::error::AppError;

pub struct DepartmentService;

#[allow(dead_code)]
impl DepartmentService {
    pub fn create_system(conn: &Connection, sys: &DepartmentSystem, operator: &str) -> Result<DepartmentSystem, AppError> {
        DepartmentDao::insert_system(conn, sys)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "create_system".to_string(),
            action_detail: serde_json::json!({"name": sys.name}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(sys.clone())
    }

    pub fn update_system(conn: &Connection, sys: &DepartmentSystem, operator: &str) -> Result<DepartmentSystem, AppError> {
        DepartmentDao::update_system(conn, sys)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "update_system".to_string(),
            action_detail: serde_json::json!({"name": sys.name, "id": sys.id}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(sys.clone())
    }

    pub fn delete_system(conn: &Connection, id: &str, operator: &str) -> Result<(), AppError> {
        let sys = DepartmentDao::find_all_systems(conn)?
            .into_iter().find(|s| s.id == id);
        DepartmentDao::delete_system(conn, id)?;
        if let Some(s) = sys {
            let log = OperationLog {
                id: uuid::Uuid::new_v4().to_string(),
                operator: operator.to_string(),
                action_type: "delete_system".to_string(),
                action_detail: serde_json::json!({"name": s.name, "id": s.id}).to_string(),
                created_at: chrono::Utc::now().timestamp(),
            };
            LogDao::insert(conn, &log)?;
        }
        Ok(())
    }

    pub fn create_department(conn: &Connection, dept: &Department, operator: &str) -> Result<Department, AppError> {
        DepartmentDao::insert_department(conn, dept)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "create_department".to_string(),
            action_detail: serde_json::json!({"name": dept.name}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(dept.clone())
    }

    pub fn update_department(conn: &Connection, dept: &Department, operator: &str) -> Result<Department, AppError> {
        DepartmentDao::update_department(conn, dept)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "update_department".to_string(),
            action_detail: serde_json::json!({"name": dept.name, "id": dept.id}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(dept.clone())
    }

    pub fn delete_department(conn: &Connection, id: &str, operator: &str) -> Result<(), AppError> {
        let dept = DepartmentDao::find_department_by_id(conn, id)?;
        DepartmentDao::delete_department(conn, id)?;
        if let Some(d) = dept {
            let log = OperationLog {
                id: uuid::Uuid::new_v4().to_string(),
                operator: operator.to_string(),
                action_type: "delete_department".to_string(),
                action_detail: serde_json::json!({"name": d.name, "id": d.id}).to_string(),
                created_at: chrono::Utc::now().timestamp(),
            };
            LogDao::insert(conn, &log)?;
        }
        Ok(())
    }

    pub fn find_all_systems(conn: &Connection) -> Result<Vec<DepartmentSystem>, AppError> {
        DepartmentDao::find_all_systems(conn)
    }

    pub fn find_all_departments(conn: &Connection) -> Result<Vec<DepartmentWithSystem>, AppError> {
        DepartmentDao::find_all_departments(conn)
    }

    pub fn find_by_system(conn: &Connection, system_id: &str) -> Result<Vec<DepartmentWithSystem>, AppError> {
        DepartmentDao::find_by_system(conn, system_id)
    }

    pub fn get_total_capacity(conn: &Connection) -> Result<i64, AppError> {
        DepartmentDao::get_total_capacity(conn)
    }
}
