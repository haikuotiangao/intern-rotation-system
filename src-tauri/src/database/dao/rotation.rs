use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RotationAssignment {
    pub id: String,
    pub intern_id: String,
    pub department_id: String,
    pub month_index: i32,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RotationWithNames {
    pub id: String,
    pub intern_id: String,
    pub intern_name: String,
    pub intern_school: Option<String>,
    pub department_id: String,
    pub department_name: String,
    pub system_name: String,
    pub month_index: i32,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: String,
}

pub struct RotationDao;

#[allow(dead_code)]
impl RotationDao {
    pub fn insert(conn: &Connection, ra: &RotationAssignment) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO rotation_assignments (id, intern_id, department_id, month_index, start_date, end_date, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![ra.id, ra.intern_id, ra.department_id, ra.month_index, ra.start_date, ra.end_date, ra.status, ra.created_at, ra.updated_at],
        )?;
        Ok(())
    }

    pub fn insert_batch(conn: &Connection, assignments: &[RotationAssignment]) -> Result<(), AppError> {
        for a in assignments {
            Self::insert(conn, a)?;
        }
        Ok(())
    }

    pub fn update_status(conn: &Connection, id: &str, status: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE rotation_assignments SET status=?1, updated_at=?2 WHERE id=?3",
            params![status, now, id],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, ra: &RotationAssignment) -> Result<(), AppError> {
        conn.execute(
            "UPDATE rotation_assignments SET department_id=?1, month_index=?2, start_date=?3, end_date=?4, status=?5, updated_at=?6 WHERE id=?7",
            params![ra.department_id, ra.month_index, ra.start_date, ra.end_date, ra.status, ra.updated_at, ra.id],
        )?;
        Ok(())
    }

    pub fn find_by_intern(conn: &Connection, intern_id: &str) -> Result<Vec<RotationWithNames>, AppError> {
        let mut stmt = conn.prepare(
             "SELECT r.id, r.intern_id, COALESCE(i.name, '已删除'), i.graduate_school, r.department_id, COALESCE(d.name, '已删除'), COALESCE(ds.name, '未分类'), r.month_index, r.start_date, r.end_date, r.status
             FROM rotation_assignments r
             LEFT JOIN interns i ON r.intern_id = i.id
             LEFT JOIN departments d ON r.department_id = d.id
             LEFT JOIN department_systems ds ON d.system_id = ds.id
             WHERE r.intern_id=?1
             ORDER BY r.month_index"
        )?;
        let rows = stmt.query_map(params![intern_id], map_rotation_with_names)?;
        let mut result = Vec::new();
        for row in rows { result.push(row?); }
        Ok(result)
    }

    pub fn find_by_intern_and_month(conn: &Connection, intern_id: &str, month_index: i32) -> Result<Option<RotationWithNames>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT r.id, r.intern_id, COALESCE(i.name, '已删除'), i.graduate_school, r.department_id, COALESCE(d.name, '已删除'), COALESCE(ds.name, '未分类'), r.month_index, r.start_date, r.end_date, r.status
             FROM rotation_assignments r
             LEFT JOIN interns i ON r.intern_id = i.id
             LEFT JOIN departments d ON r.department_id = d.id
             LEFT JOIN department_systems ds ON d.system_id = ds.id
             WHERE r.intern_id=?1 AND r.month_index=?2"
        )?;
        let mut rows = stmt.query_map(params![intern_id, month_index], map_rotation_with_names)?;
        match rows.next() {
            Some(Ok(r)) => Ok(Some(r)),
            _ => Ok(None),
        }
    }

    pub fn find_all_by_month(conn: &Connection, month_index: i32) -> Result<Vec<RotationWithNames>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT r.id, r.intern_id, COALESCE(i.name, '已删除'), i.graduate_school, r.department_id, COALESCE(d.name, '已删除'), COALESCE(ds.name, '未分类'), r.month_index, r.start_date, r.end_date, r.status
             FROM rotation_assignments r
             LEFT JOIN interns i ON r.intern_id = i.id
             LEFT JOIN departments d ON r.department_id = d.id
             LEFT JOIN department_systems ds ON d.system_id = ds.id
             WHERE r.month_index=?1
             ORDER BY ds.sort_order, COALESCE(d.name, ''), COALESCE(i.name, '')"
        )?;
        let rows = stmt.query_map(params![month_index], map_rotation_with_names)?;
        let mut result = Vec::new();
        for row in rows { result.push(row?); }
        Ok(result)
    }

    pub fn find_all_current(conn: &Connection) -> Result<Vec<RotationWithNames>, AppError> {
        // r13 撤销:r12 的 WHERE r.start_date >= 本月 把"已经开始实习的过去月份"全过滤掉了 → 用户看不到实习生前半轮转。
        // 现在返回全部行;前端根据 status + start_date 决定"已结束/待分配/已确认"标签展示,
        // 让用户能看到实习生实习期的所有月份,而不是只有本月之后。
        let sql = "SELECT r.id, r.intern_id, COALESCE(i.name, '已删除'), i.graduate_school, r.department_id, COALESCE(d.name, '已删除'), COALESCE(ds.name, '未分类'), r.month_index, r.start_date, r.end_date, r.status
             FROM rotation_assignments r
             LEFT JOIN interns i ON r.intern_id = i.id
             LEFT JOIN departments d ON r.department_id = d.id
             LEFT JOIN department_systems ds ON d.system_id = ds.id
             ORDER BY COALESCE(i.name, ''), r.month_index";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], map_rotation_with_names)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn delete_by_intern(conn: &Connection, intern_id: &str) -> Result<(), AppError> {
        conn.execute("DELETE FROM rotation_assignments WHERE intern_id=?1", params![intern_id])?;
        Ok(())
    }

    /// 仅删除 pre_alloc 状态行(不要误删 confirmed/completed 历史)
    pub fn delete_all_prealloc(conn: &Connection) -> Result<(), AppError> {
        conn.execute("DELETE FROM rotation_assignments WHERE status='pre_alloc'", [])?;
        Ok(())
    }
}

/// 集中维护的派生函数 — 在每个 rotation 状态变更的 mutation 之后调用,
/// 重算该 intern 的 allocation_status (并 UPDATE 回去)。
///
/// 派生规则详见 schema.rs::derive_allocation_status_for_intern:
///   - 0 条 rotation → 'ready'
///   - 存在 pre_alloc → 'pre_allocated'
///   - 仅 confirmed/completed → 'confirmed' (已结束则 'completed')
///
/// 此函数独立放在 rotation DAO 末尾,便于 service 层在一次事务中复用。
pub fn recompute_allocation_status(conn: &Connection, intern_id: &str) -> Result<(), AppError> {
    // 拉取 intern 的 end_date + status (status='archived' 时直接保持现状,不再派生)
    let (end_date, intern_status): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT end_date, status FROM interns WHERE id=?1",
            params![intern_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((None, None));

    // 已归档的不再自动由 DERIVE 改写 allocation_status。
    // (active intern 才走完整派生)
    if intern_status.as_deref() == Some("archived") {
        return Ok(());
    }

    struct RotationCounts {
        pre_alloc: i64,
        confirmed: i64,
        completed: i64,
    }
    let counts = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN status='pre_alloc' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END), 0)
             FROM rotation_assignments WHERE intern_id=?1",
            params![intern_id],
            |row| {
                Ok(RotationCounts {
                    pre_alloc: row.get(0)?,
                    confirmed: row.get(1)?,
                    completed: row.get(2)?,
                })
            },
        )
        .unwrap_or(RotationCounts { pre_alloc: 0, confirmed: 0, completed: 0 });

    let total: i64 = counts.pre_alloc + counts.confirmed + counts.completed;

    let new_status: &str = if total == 0 {
        "ready"
    } else if counts.pre_alloc > 0 {
        "pre_allocated"
    } else {
        let today = chrono::Utc::now().naive_utc().date();
        let is_finished = end_date
            .as_ref()
            .and_then(|ed| chrono::NaiveDate::parse_from_str(ed, "%Y-%m-%d").ok())
            .map(|d| d < today)
            .unwrap_or(false);
        if is_finished { "completed" } else { "confirmed" }
    };

    conn.execute(
        "UPDATE interns SET allocation_status=?1, updated_at=?2 WHERE id=?3",
        params![new_status, chrono::Utc::now().timestamp(), intern_id],
    )?;
    Ok(())
}

/// 批量 — 启动时校正所有 intern 的 allocation_status (考虑 archived 不要重写)。
pub fn recompute_allocation_status_all(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id FROM interns WHERE status='active'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
        let id = row?;
        if let Err(e) = recompute_allocation_status(conn, &id) {
            eprintln!("[rotation] recompute allocation_status 失败 intern={} err={:?}", id, e);
        }
    }
    Ok(())
}

fn map_rotation_with_names(row: &rusqlite::Row) -> rusqlite::Result<RotationWithNames> {
    Ok(RotationWithNames {
        id: row.get(0)?, intern_id: row.get(1)?, intern_name: row.get(2)?,
        intern_school: row.get(3)?, department_id: row.get(4)?, department_name: row.get(5)?,
        system_name: row.get(6)?, month_index: row.get(7)?,
        start_date: row.get(8)?, end_date: row.get(9)?, status: row.get(10)?,
    })
}
