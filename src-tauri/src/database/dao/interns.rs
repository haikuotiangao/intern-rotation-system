use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Intern {
    pub id: String,
    pub class_name: String,
    pub name: String,
    pub gender: Option<String>,
    pub phone: Option<String>,
    pub parent_phone: Option<String>,
    pub graduate_school: Option<String>,
    pub remarks: Option<String>,
    pub duration_months: i32,
    pub start_date: String,
    pub end_date: Option<String>,
    pub status: String,
    pub fixed_department_id: Option<String>,
    pub allocation_status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct InternDao;

#[allow(dead_code)]
impl InternDao {
    /// 取得所有合法的部门 id(主键)集合。
    fn load_valid_dept_ids(conn: &Connection) -> Result<HashSet<String>, AppError> {
        let mut stmt = conn.prepare("SELECT id FROM departments")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut ids = HashSet::new();
        for row in rows {
            ids.insert(row?);
        }
        Ok(ids)
    }

    /// 防御性清理 intern 的 fixed_department_id:
    ///   - 若 front/import 端给的固定科室 id 不在 departments 主键集合内,
    ///     把它安全降级为 NULL,避免触发 FOREIGN KEY 约束失败。
    ///   - 若 internship 名解析列误读(如"匹院/科室id" 数字错列成 name),
    ///     这种脏数据也会被这一层清除。
    /// 返回 true 表示字段被修改过。
    pub fn clear_invalid_fixed_dept(conn: &Connection, intern: &mut Intern) -> Result<bool, AppError> {
        let raw = match intern.fixed_department_id.as_ref() {
            Some(s) => s.trim().to_string(),
            None => String::new(),
        };
        // SQLite 的 FOREIGN KEY 会把空字符串当作有效值去父表匹配,
        // 空串 ≠ NULL,匹配 departments.id='' 会失败,所以空串也必须降级为 NULL。
        if raw.is_empty() {
            if intern.fixed_department_id.is_some() {
                eprintln!(
                    "[InternDao::clear_invalid_fixed_dept] 检测到空 fixed_department_id,已自动降级为 NULL (intern.id={}, name={})",
                    intern.id, intern.name
                );
                intern.fixed_department_id = None;
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            let valid_ids = Self::load_valid_dept_ids(conn)?;
            if valid_ids.contains(&raw) {
                return Ok(false);
            }
            eprintln!(
                "[InternDao::clear_invalid_fixed_dept] 检测到非法 fixed_department_id='{}' (在 departments 表中不存在),已自动降级为 NULL (intern.id={}, name={})",
                raw, intern.id, intern.name
            );
            intern.fixed_department_id = None;
            Ok(true)
        }
    }

    pub fn insert(conn: &Connection, intern: &Intern) -> Result<(), AppError> {
        // 容错: 对于来外部调用(尤其 InternImport 路径)可能未填 allocation_status 的场景,
        // 若为空 / 非法值,自动回落到合法默认值 "ready"。这样所有 NOT NULL 字段都有保证。
        let allocation_status = match intern.allocation_status.as_str() {
            "" => "ready".to_string(),
            unknown if !matches!(unknown, "ready" | "pre_allocated" | "confirmed" | "completed") => {
                eprintln!(
                    "[InternDao::insert] 检测到未知 allocation_status='{}',自动回落为 ready (intern.id={})",
                    unknown, intern.id
                );
                "ready".to_string()
            }
            _ => intern.allocation_status.clone(),
        };
        // 防御:即使调用方漏掉 clear_invalid_fixed_dept 这里也兜底一次,
        // 避免脏数据 (例如 xlsx 列名误读) 写入触 FOREIGN KEY 约束失败。
        let mut sanitized = intern.clone();
        let _ = Self::clear_invalid_fixed_dept(conn, &mut sanitized);
        conn.execute(
            "INSERT INTO interns (id, class_name, name, gender, phone, parent_phone, graduate_school, remarks, duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                sanitized.id, sanitized.class_name, sanitized.name, sanitized.gender, sanitized.phone,
                sanitized.parent_phone, sanitized.graduate_school, sanitized.remarks,
                sanitized.duration_months, sanitized.start_date, sanitized.end_date, sanitized.status,
                sanitized.fixed_department_id, allocation_status, sanitized.created_at, sanitized.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, intern: &Intern) -> Result<(), AppError> {
        conn.execute(
            "UPDATE interns SET class_name=?1, name=?2, gender=?3, phone=?4, parent_phone=?5,
             graduate_school=?6, remarks=?7, duration_months=?8, start_date=?9, end_date=?10, status=?11,
             fixed_department_id=?12, allocation_status=?13, updated_at=?14 WHERE id=?15",
            params![
                intern.class_name, intern.name, intern.gender, intern.phone,
                intern.parent_phone, intern.graduate_school, intern.remarks,
                intern.duration_months, intern.start_date, intern.end_date, intern.status,
                intern.fixed_department_id, intern.allocation_status, intern.updated_at, intern.id
            ],
        )?;
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
        conn.execute("DELETE FROM rotation_assignments WHERE intern_id=?1", params![id])?;
        conn.execute("DELETE FROM interns WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Intern>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, class_name, name, gender, phone, parent_phone, graduate_school, remarks,
             duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at FROM interns WHERE id=?1"
        )?;
        let mut rows = stmt.query_map(params![id], map_intern)?;
        match rows.next() {
            Some(Ok(intern)) => Ok(Some(intern)),
            _ => Ok(None),
        }
    }

    pub fn find_all(conn: &Connection, status_filter: Option<&str>) -> Result<Vec<Intern>, AppError> {
        let sql = match status_filter {
            Some(_) => "SELECT id, class_name, name, gender, phone, parent_phone, graduate_school, remarks,
                         duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at FROM interns WHERE status=?1 ORDER BY class_name, name",
            None => "SELECT id, class_name, name, gender, phone, parent_phone, graduate_school, remarks,
                     duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at FROM interns ORDER BY class_name, name",
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = if let Some(status) = status_filter {
            stmt.query_map(params![status], map_intern)?
        } else {
            stmt.query_map([], map_intern)?
        };
        let mut interns = Vec::new();
        for row in rows {
            interns.push(row?);
        }
        Ok(interns)
    }

    pub fn search(conn: &Connection, keyword: &str, status_filter: Option<&str>) -> Result<Vec<Intern>, AppError> {
        let like = format!("%{}%", keyword);
        let mut interns = Vec::new();
        let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match status_filter {
            Some(status) => (
                "SELECT id, class_name, name, gender, phone, parent_phone, graduate_school, remarks,
                 duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at FROM interns
                 WHERE status=?1 AND (name LIKE ?2 OR class_name LIKE ?2 OR phone LIKE ?2 OR graduate_school LIKE ?2)
                 ORDER BY class_name, name".to_string(),
                vec![Box::new(status.to_string()), Box::new(like)],
            ),
            None => (
                "SELECT id, class_name, name, gender, phone, parent_phone, graduate_school, remarks,
                 duration_months, start_date, end_date, status, fixed_department_id, allocation_status, created_at, updated_at FROM interns
                 WHERE name LIKE ?1 OR class_name LIKE ?1 OR phone LIKE ?1 OR graduate_school LIKE ?1
                 ORDER BY class_name, name".to_string(),
                vec![Box::new(like)],
            ),
        };
        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(param_refs.as_slice(), map_intern)?;
        for row in rows {
            interns.push(row?);
        }
        Ok(interns)
    }

    pub fn batch_insert(conn: &Connection, interns: &[Intern]) -> Result<(), AppError> {
        for intern in interns {
            Self::insert(conn, intern)?;
        }
        Ok(())
    }

    pub fn count_active(conn: &Connection) -> Result<i64, AppError> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM interns WHERE status='active'", [], |row| row.get(0)
        )?;
        Ok(count)
    }

    pub fn count_by_status(conn: &Connection, status: &str) -> Result<i64, AppError> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM interns WHERE status=?1", params![status], |row| row.get(0)
        )?;
        Ok(count)
    }

    /// 按 allocation_status 统计实习生数量。
    pub fn count_by_allocation_status(conn: &Connection, allocation_status: &str) -> Result<i64, AppError> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM interns WHERE allocation_status=?1",
            params![allocation_status],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// 单字段更新 — 仅修改 allocation_status。可由 UI 端强行覆盖,
    /// 但更常见的路径是 rotation.rs 在每次分配 mutation 后自动 recompute。
    pub fn update_allocation_status(conn: &Connection, id: &str, allocation_status: &str) -> Result<(), AppError> {
        conn.execute(
            "UPDATE interns SET allocation_status=?1, updated_at=?2 WHERE id=?3",
            params![allocation_status, chrono::Utc::now().timestamp(), id],
        )?;
        Ok(())
    }
}

fn map_intern(row: &rusqlite::Row) -> rusqlite::Result<Intern> {
    Ok(Intern {
        id: row.get(0)?, class_name: row.get(1)?, name: row.get(2)?,
        gender: row.get(3)?, phone: row.get(4)?, parent_phone: row.get(5)?,
        graduate_school: row.get(6)?, remarks: row.get(7)?,
        duration_months: row.get(8)?, start_date: row.get(9)?, end_date: row.get(10)?,
        status: row.get(11)?, fixed_department_id: row.get(12)?, allocation_status: row.get(13)?,
        created_at: row.get(14)?, updated_at: row.get(15)?,
    })
}
