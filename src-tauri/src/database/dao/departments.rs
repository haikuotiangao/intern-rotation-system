use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DepartmentSystem {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub is_rotation: bool,
    pub rotation_interval: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Department {
    pub id: String,
    pub name: String,
    pub system_id: String,
    pub capacity: i32,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DepartmentWithSystem {
    pub id: String,
    pub name: String,
    pub system_id: String,
    pub system_name: String,
    pub capacity: i32,
    pub is_active: bool,
}

pub struct DepartmentDao;

#[allow(dead_code)]
impl DepartmentDao {
    pub fn insert_system(conn: &Connection, sys: &DepartmentSystem) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO department_systems (id, name, sort_order, is_rotation, rotation_interval) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![sys.id, sys.name, sys.sort_order, sys.is_rotation, sys.rotation_interval],
        )?;
        Ok(())
    }

    pub fn update_system(conn: &Connection, sys: &DepartmentSystem) -> Result<(), AppError> {
        conn.execute(
            "UPDATE department_systems SET name=?1, sort_order=?2, is_rotation=?3, rotation_interval=?4 WHERE id=?5",
            params![sys.name, sys.sort_order, sys.is_rotation, sys.rotation_interval, sys.id],
        )?;
        Ok(())
    }

    pub fn delete_system(conn: &Connection, id: &str) -> Result<(), AppError> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM departments WHERE system_id=?1",
            params![id], |row| row.get(0)
        )?;
        if count > 0 {
            return Err(AppError::new("该系统下还有科室，无法删除"));
        }
        conn.execute("DELETE FROM department_systems WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn find_all_systems(conn: &Connection) -> Result<Vec<DepartmentSystem>, AppError> {
        let mut stmt = conn.prepare("SELECT id, name, sort_order, is_rotation, rotation_interval FROM department_systems ORDER BY sort_order")?;
        let rows = stmt.query_map([], |row| {
            Ok(DepartmentSystem {
                id: row.get(0)?, name: row.get(1)?, sort_order: row.get(2)?,
                is_rotation: row.get::<_, i32>(3)? != 0,
                rotation_interval: row.get(4)?,
            })
        })?;
        let mut systems = Vec::new();
        for row in rows { systems.push(row?); }
        Ok(systems)
    }

    pub fn insert_department(conn: &Connection, dept: &Department) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO departments (id, name, system_id, capacity, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![dept.id, dept.name, dept.system_id, dept.capacity, dept.is_active, dept.created_at, dept.updated_at],
        )?;
        Ok(())
    }

    pub fn update_department(conn: &Connection, dept: &Department) -> Result<(), AppError> {
        conn.execute(
            "UPDATE departments SET name=?1, system_id=?2, capacity=?3, is_active=?4, updated_at=?5 WHERE id=?6",
            params![dept.name, dept.system_id, dept.capacity, dept.is_active, dept.updated_at, dept.id],
        )?;
        Ok(())
    }

    pub fn delete_department(conn: &Connection, id: &str) -> Result<(), AppError> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM rotation_assignments WHERE department_id=?1",
            params![id], |row| row.get(0)
        )?;
        if count > 0 {
            return Err(AppError::new("该科室已有轮转记录，无法删除"));
        }
        conn.execute("DELETE FROM departments WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn find_department_by_id(conn: &Connection, id: &str) -> Result<Option<Department>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, name, system_id, capacity, is_active, created_at, updated_at FROM departments WHERE id=?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Department {
                id: row.get(0)?, name: row.get(1)?, system_id: row.get(2)?,
                capacity: row.get(3)?, is_active: row.get(4)?,
                created_at: row.get(5)?, updated_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(Ok(d)) => Ok(Some(d)),
            _ => Ok(None),
        }
    }

    pub fn find_all_departments(conn: &Connection) -> Result<Vec<DepartmentWithSystem>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT d.id, d.name, d.system_id, s.name as system_name, d.capacity, d.is_active
             FROM departments d JOIN department_systems s ON d.system_id = s.id
             WHERE d.is_active=1 ORDER BY s.sort_order, d.name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DepartmentWithSystem {
                id: row.get(0)?, name: row.get(1)?, system_id: row.get(2)?,
                system_name: row.get(3)?, capacity: row.get(4)?, is_active: row.get(5)?,
            })
        })?;
        let mut depts = Vec::new();
        for row in rows { depts.push(row?); }
        Ok(depts)
    }

    pub fn find_by_system(conn: &Connection, system_id: &str) -> Result<Vec<DepartmentWithSystem>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT d.id, d.name, d.system_id, s.name as system_name, d.capacity, d.is_active
             FROM departments d JOIN department_systems s ON d.system_id = s.id
             WHERE d.system_id=?1 AND d.is_active=1 ORDER BY d.name"
        )?;
        let rows = stmt.query_map(params![system_id], |row| {
            Ok(DepartmentWithSystem {
                id: row.get(0)?, name: row.get(1)?, system_id: row.get(2)?,
                system_name: row.get(3)?, capacity: row.get(4)?, is_active: row.get(5)?,
            })
        })?;
        let mut depts = Vec::new();
        for row in rows { depts.push(row?); }
        Ok(depts)
    }

    pub fn get_total_capacity(conn: &Connection) -> Result<i64, AppError> {
        let total: i64 = conn.query_row(
            "SELECT COALESCE(SUM(capacity), 0) FROM departments WHERE is_active=1", [], |row| row.get(0)
        )?;
        Ok(total)
    }
}
