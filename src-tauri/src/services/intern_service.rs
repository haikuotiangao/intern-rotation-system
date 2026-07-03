use rusqlite::Connection;
use crate::database::dao::interns::{Intern, InternDao};
use crate::database::dao::logs::{OperationLog, LogDao};
use crate::error::AppError;
use crate::database::dao::rotation::RotationDao;

pub struct InternService;

/// 业务规则(2026-06-30 不可违背):实习开始日期必须 ≥ 当前系统日期;默认实习时长 180 天。
///   - 旧数据/历史已经写入的实习生若违反,update 路径只在显式修改 start_date 时拦截,
///     仅刷新 duration/end_date 时不强制(避免破坏现存档案)。
fn validate_start_date_not_past(start_date: &str) -> Result<(), AppError> {
    if start_date.is_empty() {
        return Err(AppError::new("开始日期不能为空"));
    }
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if start_date < today.as_str() {
        return Err(AppError::new(&format!(
            "开始日期({})必须 ≥ 今日({}),这是实习生管理系统的固定规则",
            start_date, today
        )));
    }
    Ok(())
}

#[allow(dead_code)]
impl InternService {
    pub fn create(conn: &Connection, intern: &Intern, operator: &str) -> Result<Intern, AppError> {
        validate_start_date_not_past(&intern.start_date)?;
        // 强制设置默认 allocation_status = 'ready' (除非调用方显式传入)。
        // 这里的"默认"语义:若调用方传空字符串,我们就当 ready;
        // 防御前端因 type 新增字段时不写 allocation_status 的情况。
        let mut to_insert = intern.clone();
        let trimmed = to_insert.allocation_status.trim();
        if trimmed.is_empty() {
            // 老客户端传入空 → 默认 ready
            // 业务语义变化(r-f22):若该实习生传了 fixed_department_id(固定科室),
            //   她不需要走 ready 阶段,直接视为「已确认」(她不存在"未分配"语义)。
            //   调用方可以显式传 'confirmed' 来表达这一点;若传空则 fixed→'confirmed',其他→'ready'。
            let has_fixed = to_insert.fixed_department_id.as_ref().map_or(false, |s| !s.is_empty());
            if has_fixed {
                to_insert.allocation_status = "confirmed".to_string();
            } else {
                to_insert.allocation_status = "ready".to_string();
            }
        } else if !["ready", "pre_allocated", "confirmed", "completed"]
            .contains(&trimmed)
        {
            return Err(AppError::new(&format!(
                "无效的 allocation_status: {} (允许: ready/pre_allocated/confirmed/completed)",
                to_insert.allocation_status
            )));
        }
        // 防御:固定科室 id 若不在 departments 表则降级为 NULL,避免 FOREIGN KEY 失败。
        let _ = InternDao::clear_invalid_fixed_dept(conn, &mut to_insert);
        InternDao::insert(conn, &to_insert)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "create_intern".to_string(),
            action_detail: serde_json::json!({"name": to_insert.name, "class": to_insert.class_name}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(to_insert)
    }

    /// 更新 intern — 不会自动派生 allocation_status。
    /// rotation mutation(pro_allocate/confirm/manual_adjust/reset)会自动维护该字段。
    /// 此函数仅允许调用方显式传入新值,例如从 UI 强行覆盖。
    pub fn update(conn: &Connection, intern: &Intern, operator: &str) -> Result<Intern, AppError> {
        // f25: 仅当 start_date 确实被修改了(与数据库当前值不一致)时才校验过去日期。
        //     避免编辑其他字段(实习时长/备注等)时因历史 start_date 被原样提交而误拦。
        // 同时:**fixed_department_id 变化**会触发联动清理 rotation 表与修正 status。
        let existing = InternDao::find_by_id(conn, &intern.id)?;
        if let Some(ref ex) = existing {
            if ex.start_date != intern.start_date {
                validate_start_date_not_past(&intern.start_date)?;
            }
        } else {
            validate_start_date_not_past(&intern.start_date)?;
        }
        // 对 allocation_status 做允许枚举校验
        let trimmed = intern.allocation_status.trim();
        if !trimmed.is_empty()
            && !["ready", "pre_allocated", "confirmed", "completed"]
                .contains(&trimmed)
        {
            return Err(AppError::new(&format!(
                "无效的 allocation_status: {} (允许: ready/pre_allocated/confirmed/completed)",
                intern.allocation_status
            )));
        }
        // 防御:固定科室 id 若不在 departments 表则降级为 NULL。
        let mut sanitized = intern.clone();
        let _ = InternDao::clear_invalid_fixed_dept(conn, &mut sanitized);

        // ★ 联动逻辑(r-f22):fixed_department_id 发生变化时同步刷新 rotation 表与 allocation_status
        let mut fixed_changed_to_set = false;          // 空 → 有
        let mut fixed_changed_to_clear = false;        // 有 → 空
        if let Some(ref ex) = existing {
            let (old_has, new_has) = (
                ex.fixed_department_id.as_ref().map_or(false, |s| !s.is_empty()),
                sanitized.fixed_department_id.as_ref().map_or(false, |s| !s.is_empty()),
            );
            // 仅在两端值不同且非 archived 时处理(archived 不让 rotate 触发)
            if old_has != new_has {
                if new_has { fixed_changed_to_set = true; } else { fixed_changed_to_clear = true; }
            }
        }

        InternDao::update(conn, &sanitized)?;

        if fixed_changed_to_set {
            // 切到固定科室:她不再属于轮转分配,旧 rotation 行无意义。
            // 全部 DELETE,然后显式写 allocation_status='confirmed'(她无需走 ready 阶段)。
            RotationDao::delete_by_intern(conn, &sanitized.id)?;
            let now = chrono::Utc::now().timestamp();
            conn.execute(
                "UPDATE interns SET allocation_status='confirmed', updated_at=?1 WHERE id=?2",
                rusqlite::params![now, sanitized.id],
            )?;
        } else if fixed_changed_to_clear {
            // 切回轮转型:删除旧 rotation,显式重置为 ready(让用户下次点「一键预分配」生成方案)
            RotationDao::delete_by_intern(conn, &sanitized.id)?;
            let now = chrono::Utc::now().timestamp();
            conn.execute(
                "UPDATE interns SET allocation_status='ready', updated_at=?1 WHERE id=?2",
                rusqlite::params![now, sanitized.id],
            )?;
        }

        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "update_intern".to_string(),
            action_detail: serde_json::json!({
                "name": intern.name,
                "id": intern.id,
                "fixed_changed_to_set": fixed_changed_to_set,
                "fixed_changed_to_clear": fixed_changed_to_clear,
            }).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(sanitized)
    }

    /// 直接修改 allocation_status 单字段(供 UI 直接覆盖 + 操作日志)。
    pub fn update_allocation(
        conn: &Connection,
        intern_id: &str,
        allocation_status: &str,
        operator: &str,
    ) -> Result<(), AppError> {
        let allowed = ["ready", "pre_allocated", "confirmed", "completed"];
        if !allowed.contains(&allocation_status) {
            return Err(AppError::new(&format!(
                "无效的 allocation_status: {} (允许: ready/pre_allocated/confirmed/completed)",
                allocation_status
            )));
        }
        InternDao::update_allocation_status(conn, intern_id, allocation_status)?;
        // 拉取 intern.name 用于日志可读性
        let name: Option<String> = conn
            .query_row(
                "SELECT name FROM interns WHERE id=?1",
                rusqlite::params![intern_id],
                |row| row.get(0),
            )
            .ok();
        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "update_intern_allocation".to_string(),
            action_detail: serde_json::json!({
                "name": name,
                "id": intern_id,
                "allocation_status": allocation_status
            }).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        })?;
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str, operator: &str) -> Result<(), AppError> {
        let intern = InternDao::find_by_id(conn, id)?;
        InternDao::delete(conn, id)?;
        // InternDao::delete 已 DELETE rotation_assignments + intern 行,
        // 不需要再 recompute — 该 intern 行已不存在。
        if let Some(i) = intern {
            let log = OperationLog {
                id: uuid::Uuid::new_v4().to_string(),
                operator: operator.to_string(),
                action_type: "delete_intern".to_string(),
                action_detail: serde_json::json!({"name": i.name, "id": i.id}).to_string(),
                created_at: chrono::Utc::now().timestamp(),
            };
            LogDao::insert(conn, &log)?;
        }
        Ok(())
    }

    pub fn batch_import(conn: &Connection, interns: &[Intern], operator: &str) -> Result<i32, AppError> {
        // 业务规则:批量导入的每一行 start_date 都必须 ≥ 今日
        for intern in interns {
            validate_start_date_not_past(&intern.start_date)?;
        }
        // 防御:对每条 import 行清除非法固定科室 id,避免 FOREIGN KEY 失败。
        let mut sanitized_interns: Vec<Intern> = Vec::with_capacity(interns.len());
        for intern in interns {
            let mut copy = intern.clone();
            let _ = InternDao::clear_invalid_fixed_dept(conn, &mut copy);
            sanitized_interns.push(copy);
        }
        InternDao::batch_insert(conn, &sanitized_interns)?;
        let log = OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "batch_import".to_string(),
            action_detail: serde_json::json!({"count": interns.len()}).to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        LogDao::insert(conn, &log)?;
        Ok(interns.len() as i32)
    }

    pub fn find_all(conn: &Connection, status: Option<&str>) -> Result<Vec<Intern>, AppError> {
        InternDao::find_all(conn, status)
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Intern>, AppError> {
        InternDao::find_by_id(conn, id)
    }

    pub fn search(conn: &Connection, keyword: &str, status: Option<&str>) -> Result<Vec<Intern>, AppError> {
        InternDao::search(conn, keyword, status)
    }

    pub fn count_active(conn: &Connection) -> Result<i64, AppError> {
        InternDao::count_active(conn)
    }
}
