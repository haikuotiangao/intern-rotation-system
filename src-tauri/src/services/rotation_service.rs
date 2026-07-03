use rusqlite::Connection;

use chrono::{NaiveDate, Datelike, Months};
use crate::database::dao::interns::{Intern, InternDao};
use crate::database::dao::departments::{DepartmentSystem, DepartmentWithSystem, DepartmentDao};
use crate::database::dao::rotation::{RotationAssignment, RotationWithNames, RotationDao, recompute_allocation_status, recompute_allocation_status_all};
use crate::database::dao::logs::{OperationLog, LogDao};
use crate::error::AppError;

pub struct RotationService;

impl RotationService {
    /// 预分配轮转方案（自然月 + 比例分配 + 固定科室 + 非轮转科室）
    /// r12→r13 rollback:不再 cut active 实习生。所有 active 都参与预分配。
    /// 是否生成 future-only 行由 intern_rotation_months 自然处理(过期实习生会被 end 截止)。
    pub fn pre_allocate(conn: &Connection) -> Result<Vec<RotationWithNames>, AppError> {
        Self::pre_allocate_internal(conn, true)
    }

    fn pre_allocate_internal(conn: &Connection, skip_already_assigned: bool) -> Result<Vec<RotationWithNames>, AppError> {
        let today = chrono::Utc::now().naive_utc().date();
        let this_month: NaiveDate = if today.day() == 1 {
            today
        } else {
            (today + Months::new(1)).with_day(1).unwrap_or(today)
        };

        // r13: 不过滤实习生。所有 status='active' 的都参与预分配。
        // 用户原话:实习生有 40 多个,他们的实习期横跨过去/未来/当前。
        // 算法 intern_rotation_months 自然按 end_date 截止过期月份,不会生成过去日期的行。
        let interns: Vec<Intern> = InternDao::find_all(conn, Some("active"))?;

        let systems = DepartmentDao::find_all_systems(conn)?;
        let all_depts = DepartmentDao::find_all_departments(conn)?;

        if interns.is_empty() {
            return Err(AppError::new("没有活跃实习生。请先在「当前实习」页录入。"));
        }
        if all_depts.is_empty() {
            return Err(AppError::new("没有可用科室,请先添加科室"));
        }

        // r12 全局轮转起始日 = 本月 1 号
        let rotation_start = this_month;

        // f22 修复:total_capacity / 算法中所有科室选择,只能考虑「轮转系统」(is_rotation=true)。
        //   - 信息科 / 医保办(fixed 科室)不参与轮转分配,其 capacity 不参与统计、也不会出现在排班中。
        //   - 单一权威 derived collection,后续算法不再重复 filter
        let rotation_systems_owned: Vec<crate::database::dao::departments::DepartmentSystem> =
            systems.iter().filter(|s| s.is_rotation).cloned().collect();
        if rotation_systems_owned.is_empty() {
            return Err(AppError::new("至少需要一个轮转系统"));
        }
        for sys in &rotation_systems_owned {
            if !all_depts.iter().any(|d| d.system_id == sys.id) {
                return Err(AppError::new(&format!("系统「{}」下没有科室,请先添加科室", sys.name)));
            }
        }
        let rotation_systems: Vec<&crate::database::dao::departments::DepartmentSystem> =
            rotation_systems_owned.iter().collect();
        let rotation_system_ids: std::collections::HashSet<String> =
            rotation_systems_owned.iter().map(|s| s.id.clone()).collect();
        let total_capacity: i64 = all_depts
            .iter()
            .filter(|d| rotation_system_ids.contains(&d.system_id))
            .map(|d| d.capacity as i64)
            .sum();
        if (total_capacity as usize) < interns.len() {
            return Err(AppError::new(&format!(
                "轮转科室总容量({})小于实习生总数({}),请增加轮转科室容量",
                total_capacity, interns.len()
            )));
        }
        // f22:为 allocate_group 准备 filtered 科室集合(只包含轮转系统下的科室),
        //   防止 P4a / P5 把 fixed 科室派进轮转序列。
        //   注意:签名是 `&[DepartmentWithSystem]`(owned slice),所以这里给 owned Vec,
        //   而不是 `Vec<&DepartmentWithSystem>`。
        let rotation_departments: Vec<DepartmentWithSystem> = all_depts
            .iter()
            .filter(|d| rotation_system_ids.contains(&d.system_id))
            .cloned()
            .collect();

        RotationDao::delete_all_prealloc(conn)?;

        let now = chrono::Utc::now().timestamp();
        let mut all_assignments: Vec<RotationAssignment> = Vec::new();

        // r10: 业务规则 — 只为"尚未分配过任何轮转记录"的实习生生成预分配记录
        // "clean_all_and_repreallocate" 路径下 skip_already_assigned=false,全部重新分配
        // f21 调整:"尚未分配过"改为"allocation_status == 'ready'" — 业务语义更稳健
        //   - 旧:基于"是否有 rotation 行"过滤;一个 allocation_status='ready' 但历史被清空的实习生能被识别
        //   - 新:基于分配状态机本身,只有 ready 状态的实习生才进入预分配
        //   - skip_already_assigned=false ("全清重排") 路径保持原状
        let interns: Vec<Intern> = if skip_already_assigned {
            interns.into_iter().filter(|i| {
                // 只 action "ready" 实习生;pre_allocated / confirmed / completed 一律跳过(已有正式分配历史)
                i.allocation_status == "ready"
            }).collect()
        } else {
            interns
        };
        if interns.is_empty() {
            // 没有需要预分配的新实习生 — 返回当前所有 rotation(可能只是确认过的)
            return Self::get_all_current(conn);
        }

        // 重新创建借用视图,因上一步 interns 已被移动到新 vector(r10)
        let interns_view: Vec<Intern> = interns.clone();

        // 固定科室 / 非轮转科室实习生：分配到指定科室所有月
        let fixed_interns: Vec<&Intern> = interns_view.iter().filter(|i| {
            i.fixed_department_id.as_ref().map_or(false, |fid| !fid.is_empty())
        }).collect();

        // 对有 fixed_department_id 的实习生，计算其轮转月数
        for intern in &fixed_interns {
            let dept_id = intern.fixed_department_id.as_ref().unwrap();
            let offset = Self::intern_start_offset(intern, &rotation_start);
            let total_months = Self::intern_rotation_months(intern, &rotation_start);
            let intern_start = NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d").ok();
            let intern_end = Self::intern_end_date(intern);
            for m in offset..(offset + total_months) {
                let ms = rotation_start + Months::new(m as u32);
                let next_month = rotation_start + Months::new((m + 1) as u32);
                let me = next_month.pred_opt().unwrap_or(next_month);
                let actual_start = if m == offset {
                    intern_start.map(|s| std::cmp::max(s, ms)).unwrap_or(ms)
                } else {
                    ms
                };
                let actual_end = if m == offset + total_months - 1 {
                    intern_end.unwrap_or(me)
                } else {
                    me
                };
                all_assignments.push(RotationAssignment {
                    id: uuid::Uuid::new_v4().to_string(),
                    intern_id: intern.id.clone(),
                    department_id: dept_id.clone(),
                    month_index: (m + 1) as i32,
                    start_date: Some(actual_start.format("%Y-%m-%d").to_string()),
                    end_date: Some(actual_end.format("%Y-%m-%d").to_string()),
                    status: "pre_alloc".to_string(),
                    created_at: now,
                    updated_at: now,
                });
            }
        }

        // 轮转科室实习生：交替系统 + 比例分配
        let rotation_interns: Vec<&Intern> = interns_view.iter()
            .filter(|i| i.fixed_department_id.as_ref().map_or(true, |fid| fid.is_empty()))
            .collect();

        if !rotation_interns.is_empty() {
            // rotation_systems / rotation_departments 已在前面 f22 段准备好,直接调用
            Self::allocate_group(&rotation_interns, &rotation_systems, &rotation_departments, &rotation_start, now, &mut all_assignments)?;
        }

        RotationDao::insert_batch(conn, &all_assignments)?;

        // 派生所有受影响 intern 的 allocation_status = 'pre_allocated'。
        // 使用 HashSet 去重,确保大实习群体下 SQL UPDATE 数量不超过人数。
        use std::collections::HashSet;
        let mut affected: HashSet<String> = HashSet::new();
        for a in &all_assignments {
            affected.insert(a.intern_id.clone());
        }
        for intern_id in &affected {
            if let Err(e) = recompute_allocation_status(conn, intern_id) {
                eprintln!("[rotation_service.pre_allocate] recompute 失败 intern={} err={:?}", intern_id, e);
            }
        }

        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: "系统".to_string(),
            action_type: "pre_allocate".to_string(),
            action_detail: format!("预分配完成，共{}名实习生（{}条记录），起始日{}",
                interns.len(), all_assignments.len(),
                rotation_start.format("%Y-%m-%d")),
            created_at: chrono::Utc::now().timestamp(),
        })?;

        // f21: 只返回本次新增的记录 — 取整库 current,再按全部 (intern_id, month_index) 交集过滤
        let all_current = Self::get_all_current(conn)?;
        let new_keys: std::collections::HashSet<(String, i32)> = all_assignments
            .iter()
            .map(|a| (a.intern_id.clone(), a.month_index))
            .collect();
        Ok(all_current
            .into_iter()
            .filter(|r| new_keys.contains(&(r.intern_id.clone(), r.month_index)))
            .collect())
    }

    /// 解析实习生的结束日期
    fn intern_end_date(intern: &Intern) -> Option<NaiveDate> {
        match &intern.end_date {
            Some(ed) => NaiveDate::parse_from_str(ed, "%Y-%m-%d").ok(),
            None => NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d")
                .ok().map(|s| s + Months::new(intern.duration_months as u32)),
        }
    }

    /// 实习生个人轮转起始日 = start_date 所在月1号
    fn intern_personal_start(intern: &Intern) -> NaiveDate {
        match NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d") {
            Ok(sd) => sd.with_day(1).unwrap_or(sd),
            Err(_) => {
                let now = chrono::Utc::now().naive_utc().date();
                now.with_day(1).unwrap_or(now)
            }
        }
    }

    /// 计算实习生个人轮转起始日到全局 rotation_start 的偏移月数
    /// 如果 personal_start <= rotation_start，返回 0
    /// 否则返回从 rotation_start 到 personal_start 的月数
    fn intern_start_offset(intern: &Intern, rotation_start: &NaiveDate) -> usize {
        let personal_start = Self::intern_personal_start(intern);
        if personal_start <= *rotation_start { return 0; }
        let diff = (personal_start.year() - rotation_start.year()) * 12
            + personal_start.month() as i32 - rotation_start.month() as i32;
        std::cmp::max(0, diff as usize)
    }

    /// 计算实习生从 effective_start（rotation_start 与 personal_start 的较晚者）到结束日的有效轮转月数
    fn intern_rotation_months(intern: &Intern, rotation_start: &NaiveDate) -> usize {
        let effective_start = std::cmp::max(Self::intern_personal_start(intern), *rotation_start);
        let end = Self::intern_end_date(intern);
        match end {
            Some(e) if e > effective_start => {
                let count = ((e.year() - effective_start.year()) * 12 + e.month() as i32 - effective_start.month() as i32) as usize + 1;
                std::cmp::max(1, count)
            }
            _ => intern.duration_months as usize,
        }
    }

    fn allocate_group(
        interns: &[&Intern],
        rotation_systems: &[&DepartmentSystem],
        rotation_departments: &[DepartmentWithSystem],
        rotation_start: &NaiveDate,
        now: i64,
        assignments: &mut Vec<RotationAssignment>,
    ) -> Result<(), AppError> {
        let max_months = interns.iter()
            .map(|i| Self::intern_start_offset(i, rotation_start) + Self::intern_rotation_months(i, rotation_start))
            .max().unwrap_or(6);

        let n_systems = rotation_systems.len();

        // Per-system total capacity (department capacities sum)
        let sys_capacities: Vec<usize> = rotation_systems.iter().map(|sys| {
            rotation_departments.iter()
                .filter(|d| d.system_id == sys.id)
                .map(|d| d.capacity as usize)
                .sum()
        }).collect();

        let mut intern_system_history: std::collections::HashMap<String, Vec<usize>> = std::collections::HashMap::new();
        let mut last_department: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

        for m in 0..max_months {
            let ms = *rotation_start + Months::new(m as u32);
            let next_month = *rotation_start + Months::new((m + 1) as u32);
            let me = next_month.pred_opt().unwrap_or(next_month);

            let month_interns: Vec<&Intern> = interns.iter()
                .filter(|i| {
                    let offset = Self::intern_start_offset(i, rotation_start);
                    let total = Self::intern_rotation_months(i, rotation_start);
                    m >= offset && m < offset + total
                })
                .copied()
                .collect();

            if month_interns.is_empty() { continue; }

            let total_interns = month_interns.len();
            let total_cap: usize = sys_capacities.iter().sum();
            if total_cap < total_interns {
                return Err(AppError::new(&format!(
                    "第{}个月各系统总容量({})不足，有{}名实习生需要轮转",
                    m + 1, total_cap, total_interns
                )));
            }

            let pre_dept = last_department.clone();
            let mut global_dept_usage: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

            // Sort interns by total unvisited departments across ALL systems (most constrained first)
            let mut sorted_interns: Vec<&&Intern> = month_interns.iter().collect();
            sorted_interns.sort_by_key(|i| {
                let visited = pre_dept.get(&i.id).map(|v| v.as_slice()).unwrap_or(&[]);
                rotation_departments.iter()
                    .filter(|d| !visited.contains(&d.id))
                    .count()
            });

            let mut assigned_counts = vec![0usize; n_systems];
            let mut monthly: Vec<(&Intern, usize)> = Vec::new();

            for intern in sorted_interns {
                let history = intern_system_history.get(&intern.id).map(|v| v.as_slice()).unwrap_or(&[]);
                let last_month_sys = history.last().copied();

                let visited = pre_dept.get(&intern.id).map(|v| v.as_slice()).unwrap_or(&[]);

                let mut assigned_pair: Option<(usize, &DepartmentWithSystem)> = None;

                // Priority 1: Different system, unvisited department with capacity
                'p1: for sys_idx in 0..n_systems {
                    if assigned_counts[sys_idx] >= sys_capacities[sys_idx] { continue; }
                    if Some(sys_idx) == last_month_sys { continue; }

                    for dept in rotation_departments.iter().filter(|d| d.system_id == rotation_systems[sys_idx].id) {
                        if visited.contains(&dept.id) { continue; }
                        let dept_used = global_dept_usage.get(&dept.id).copied().unwrap_or(0);
                        if dept_used >= dept.capacity as usize { continue; }

                        assigned_pair = Some((sys_idx, dept));
                        break 'p1;
                    }
                }

                // Priority 2: Different system, unvisited department (allow overfill)
                if assigned_pair.is_none() {
                    'p2: for sys_idx in 0..n_systems {
                        if assigned_counts[sys_idx] >= sys_capacities[sys_idx] { continue; }
                        if Some(sys_idx) == last_month_sys { continue; }

                        for dept in rotation_departments.iter().filter(|d| d.system_id == rotation_systems[sys_idx].id) {
                            if visited.contains(&dept.id) { continue; }

                            assigned_pair = Some((sys_idx, dept));
                            break 'p2;
                        }
                    }
                }

                // Priority 3: Same system as last month, UNVISITED department
                if assigned_pair.is_none() {
                    if let Some(last) = last_month_sys {
                        'p3: for dept in rotation_departments.iter().filter(|d| d.system_id == rotation_systems[last].id) {
                            if !visited.contains(&dept.id) {
                                assigned_pair = Some((last, dept));
                                break 'p3;
                            }
                        }
                    }
                }

                // Priority 4: Ultimate fallback - any UNVISITED department with capacity first
                if assigned_pair.is_none() {
                    // 4a: 优先匹配任何「未去过的」科室(放过容量/系统约束)
                    //   f22 修复:必须跳过不属于任何轮转系统的科室;否则当实习生人数多时,
                    //   算法会把 fixed 科室(如信息科、医保办)意外派进轮转序列,
                    //   这是用户不允许的(轮转=只对 is_rotation=true 的系统/科室)。
                    'p4a: for dept in rotation_departments.iter() {
                        if visited.contains(&dept.id) { continue; }
                        let sys_idx_opt = rotation_systems.iter().position(|s| s.id == dept.system_id);
                        // 关键:不属于任何轮转系统(行政部门 等)的科室直接跳过
                        let sys_idx = match sys_idx_opt {
                            Some(i) => i,
                            None => continue,
                        };
                        if assigned_counts[sys_idx] >= sys_capacities[sys_idx] { continue; }
                        assigned_pair = Some((sys_idx, dept));
                        break 'p4a;
                    }
                }

                // Priority 5: Final fallback - ANY department with capacity (allow repeat)
                if assigned_pair.is_none() {
                    'p5: for sys_idx in 0..n_systems {
                        if assigned_counts[sys_idx] >= sys_capacities[sys_idx] { continue; }
                        for dept in rotation_departments.iter().filter(|d| d.system_id == rotation_systems[sys_idx].id) {
                            let dept_used = global_dept_usage.get(&dept.id).copied().unwrap_or(0);
                            if dept_used < dept.capacity as usize {
                                assigned_pair = Some((sys_idx, dept));
                                break 'p5;
                            }
                        }
                    }
                }

                if let Some((sys_idx, dept)) = assigned_pair {
                    monthly.push((intern, sys_idx));
                    assigned_counts[sys_idx] += 1;
                    *global_dept_usage.entry(dept.id.clone()).or_insert(0) += 1;
                    intern_system_history.entry(intern.id.clone()).or_default().push(sys_idx);

                    let offset = Self::intern_start_offset(intern, rotation_start);
                    let total = Self::intern_rotation_months(intern, rotation_start);
                    let intern_start = NaiveDate::parse_from_str(&intern.start_date, "%Y-%m-%d").ok();
                    let intern_end = Self::intern_end_date(intern);
                    let actual_start = if m == offset {
                        intern_start.map(|s| std::cmp::max(s, ms)).unwrap_or(ms)
                    } else {
                        ms
                    };
                    let actual_end = if m == offset + total - 1 {
                        intern_end.unwrap_or(me)
                    } else {
                        me
                    };
                    assignments.push(RotationAssignment {
                        id: uuid::Uuid::new_v4().to_string(),
                        intern_id: intern.id.clone(),
                        department_id: dept.id.clone(),
                        month_index: (m + 1) as i32,
                        start_date: Some(actual_start.format("%Y-%m-%d").to_string()),
                        end_date: Some(actual_end.format("%Y-%m-%d").to_string()),
                        status: "pre_alloc".to_string(),
                        created_at: now,
                        updated_at: now,
                    });
                    last_department.entry(intern.id.clone()).or_default().push(dept.id.clone());
                }
            }
        }
        Ok(())
    }

    /// 最大余数法比例分配
    /// 输入：科室列表（含容量）、分配人数、已有分配
    /// 输出：按序排列的科室列表（长度=人数）
    #[allow(dead_code)]
    fn proportional_assign<'a>(
        depts: &[&'a DepartmentWithSystem],
        total_people: usize,
        existing: &[&RotationAssignment],
    ) -> Vec<&'a DepartmentWithSystem> {
        if depts.is_empty() || total_people == 0 { return vec![]; }

        // 统计每个科室当前月已有分配数
        let mut cur_counts: std::collections::HashMap<&str, i32> = std::collections::HashMap::new();
        for a in existing {
            *cur_counts.entry(a.department_id.as_str()).or_insert(0) += 1;
        }

        let remaining_caps: Vec<(usize, &DepartmentWithSystem)> = depts.iter().enumerate()
            .filter(|(_, d)| cur_counts.get(d.id.as_str()).copied().unwrap_or(0) < d.capacity)
            .map(|(i, d)| (i, *d))
            .collect();

        if remaining_caps.is_empty() {
            return depts.to_vec();
        }

        let total_cap: f64 = remaining_caps.iter().map(|(_, d)| d.capacity as f64).sum();
        let available_slots: i32 = remaining_caps.iter()
            .map(|(_, d)| d.capacity - cur_counts.get(d.id.as_str()).copied().unwrap_or(0))
            .sum();

        let assign_count = std::cmp::min(total_people as i32, available_slots) as usize;

        // 计算理论理想值
        struct DeptAlloc<'a> {
            dept: &'a DepartmentWithSystem,
            ideal: f64,
            base: usize,
            frac: f64,
        }

        let mut allocs: Vec<DeptAlloc> = remaining_caps.iter().map(|(_, d)| {
            let ideal = assign_count as f64 * d.capacity as f64 / total_cap;
            DeptAlloc { dept: d, ideal, base: ideal.floor() as usize, frac: ideal.fract() }
        }).collect();

        // 先分配整数部分
        let mut result: Vec<&DepartmentWithSystem> = Vec::new();
        for a in &allocs {
            for _ in 0..a.base {
                result.push(a.dept);
            }
        }

        // 剩余名额按小数部分从大到小分配
        let mut remainder = assign_count - result.len();
        allocs.sort_by(|a, b| b.frac.partial_cmp(&a.frac).unwrap_or(std::cmp::Ordering::Equal));
        for a in &allocs {
            if remainder == 0 { break; }
            let already = result.iter().filter(|d| d.id == a.dept.id).count();
            let max_for_dept = (a.dept.capacity - cur_counts.get(a.dept.id.as_str()).copied().unwrap_or(0)) as usize;
            if already < max_for_dept {
                result.push(a.dept);
                remainder -= 1;
            }
        }

        result
    }

    pub fn manual_adjust(conn: &Connection, assignment_id: &str, new_department_id: &str, operator: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        // 先捞到 intern_id,UPDATE 之后用来 recompute allocation_status。
        let intern_id: Option<String> = conn
            .query_row(
                "SELECT intern_id FROM rotation_assignments WHERE id=?1",
                rusqlite::params![assignment_id],
                |row| row.get(0),
            )
            .ok();
        conn.execute(
            "UPDATE rotation_assignments SET department_id=?1, updated_at=?2, status='pre_alloc' WHERE id=?3",
            rusqlite::params![new_department_id, now, assignment_id],
        )?;
        if let Some(iid) = intern_id {
            if let Err(e) = recompute_allocation_status(conn, &iid) {
                eprintln!("[rotation_service.manual_adjust] recompute 失败 intern={} err={:?}", iid, e);
            }
        }
        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "adjust_rotation".to_string(),
            action_detail: format!("调整轮转分配 ID:{}", assignment_id),
            created_at: chrono::Utc::now().timestamp(),
        })?;
        Ok(())
    }

    pub fn confirm_allocation(conn: &Connection, operator: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp();
        // 先收集所有被确认 (pre_alloc → confirmed) 的 intern 列表,以便 UPDATE 后派生。
        use std::collections::HashSet;
        let mut affected: HashSet<String> = HashSet::new();
        {
            let mut stmt = conn
                .prepare("SELECT DISTINCT intern_id FROM rotation_assignments WHERE status='pre_alloc'")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            for row in rows {
                if let Ok(iid) = row {
                    affected.insert(iid);
                }
            }
        }
        conn.execute(
            "UPDATE rotation_assignments SET status='confirmed', updated_at=?1 WHERE status='pre_alloc'",
            rusqlite::params![now],
        )?;
        for iid in &affected {
            if let Err(e) = recompute_allocation_status(conn, iid) {
                eprintln!("[rotation_service.confirm_allocation] recompute 失败 intern={} err={:?}", iid, e);
            }
        }
        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "confirm_allocation".to_string(),
            action_detail: "确认轮转分配方案".to_string(),
            created_at: chrono::Utc::now().timestamp(),
        })?;
        Ok(())
    }

    /// r13: 「重置」= 删除全部 + 重新预分配(包含已确认历史)
    /// 用户原话:"从数据库清理已经分配的实习生,我重新手动预分配"
    /// 即每次 reset:全表 DELETE → pre_allocate(但跳过暂无 active intern 的边界)
    pub fn reset_allocation(conn: &Connection, operator: &str) -> Result<Vec<RotationWithNames>, AppError> {
        // r14: 「重置」只清空「未确认 且 实习未开始」的轮转记录,保护已确认与已开始档案
        let now = chrono::Utc::now().timestamp();
        let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
        // 先捞出会被 DELETE 的 intern_id,这样派生阶段能精准定位不必全表扫。
        use std::collections::HashSet;
        let mut affected: HashSet<String> = HashSet::new();
        {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT intern_id FROM rotation_assignments \
                 WHERE status='pre_alloc' \
                   AND (start_date IS NULL OR substr(start_date, 1, 10) >= ?1)",
            )?;
            let rows = stmt.query_map(rusqlite::params![today_str], |row| row.get::<_, String>(0))?;
            for row in rows {
                if let Ok(iid) = row { affected.insert(iid); }
            }
        }
        let deleted = conn.execute(
            "DELETE FROM rotation_assignments \
             WHERE status='pre_alloc' \
               AND (start_date IS NULL OR substr(start_date, 1, 10) >= ?1)",
            rusqlite::params![today_str],
        )?;
        for iid in &affected {
            if let Err(e) = recompute_allocation_status(conn, iid) {
                eprintln!("[rotation_service.reset_allocation] recompute 失败 intern={} err={:?}", iid, e);
            }
        }
        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "reset_allocation".to_string(),
            action_detail: format!("重置:仅清空 {} 条未确认且未开始的预分配(已确认/已开始档案保留)", deleted),
            created_at: now,
        })?;
        // 返回当前轮转状态(不自动重排,避免覆盖已 confirmed 历史记录)
        Self::get_all_current(conn)
    }

    /// r13: 「全部清空并重新预分配」— 删除 rotation_assignments 表中**所有**行
    /// (包含 confirmed),然后重新执行 pre_allocate。供前端按钮触发。
    pub fn clean_all_and_repreallocate(conn: &Connection, operator: &str) -> Result<Vec<RotationWithNames>, AppError> {
        // 1) 清空所有行(不分状态)
        conn.execute("DELETE FROM rotation_assignments", [])?;
        // 清空后那些原本只剩 confirmed/completed 的 intern 会变成 0 行 rotation,
        // 在 active 状态下应该回到 'ready'。在 pre_allocate_internal 之后做一次全量重算,
        // 保证那些 add 不到 pre_allocate 路径 (例如被 skip_already_assigned 过滤掉)
        // 的 intern 也不会留下过时的 'pre_allocated'/'confirmed' 状态。
        LogDao::insert(conn, &OperationLog {
            id: uuid::Uuid::new_v4().to_string(),
            operator: operator.to_string(),
            action_type: "clean_all_rotation".to_string(),
            action_detail: "清空全部轮转记录(含已确认)以重新分配".to_string(),
            created_at: chrono::Utc::now().timestamp(),
        })?;
        // 2) 调用 pre_allocate,不再过滤"已分配过的实习生"(因为表空,所有人都视为首次分配)
        let result = Self::pre_allocate_internal(conn, false)?;
        // 全量校正 — 涵盖此次完全删除轮转后没人会再被动的 archived→not yet 边界,
        // 以及 pre_allocate 阶段遗漏跳过的 intern。
        if let Err(e) = recompute_allocation_status_all(conn) {
            eprintln!("[rotation_service.clean_all_and_repreallocate] recompute_all 失败 err={:?}", e);
        }
        Ok(result)
    }

    pub fn get_by_intern(conn: &Connection, intern_id: &str) -> Result<Vec<RotationWithNames>, AppError> {
        RotationDao::find_by_intern(conn, intern_id)
    }

    pub fn get_by_month(conn: &Connection, month_index: i32) -> Result<Vec<RotationWithNames>, AppError> {
        RotationDao::find_all_by_month(conn, month_index)
    }

    pub fn get_all_current(conn: &Connection) -> Result<Vec<RotationWithNames>, AppError> {
        RotationDao::find_all_current(conn)
    }

    /// 为单个实习生批量写入预分配记录(供 UI 端手动预分配使用)。
    ///
    /// 输入:
    ///   `intern_id`     - 目标实习生
    ///   `allocations`   - 元素 tuple (month_index 1-based, department_id)
    ///   `operator`      - 操作者
    ///
    /// 行为(对每对 (month_index, department_id)):
    ///   - 已存在 (intern_id, month_index) 行:
    ///       status='pre_alloc'           -> 仅 UPDATE department_id
    ///       status='confirmed'/'completed' -> 拒绝
    ///   - 不存在 -> INSERT 新行 status='pre_alloc'
    /// 完成后:
    ///   - 写操作日志
    ///   - 调用 recompute_allocation_status 重算并写回 interns.allocation_status
    ///
    /// 错误:
    ///   - intern 不存在 / 非 active
    ///   - 已 confirmed/completed 月份被覆盖尝试
    ///   - allocations 为空
    pub fn allocate_for_one_intern(
        conn: &Connection,
        intern_id: &str,
        allocations: &[(i32, String)],
        operator: &str,
    ) -> Result<(), AppError> {
        // 1) 校验 intern 存在且 active
        let intern = match InternDao::find_by_id(conn, intern_id)? {
            Some(i) => i,
            None => return Err(AppError::new(&format!("实习生(id={})不存在", intern_id))),
        };
        if intern.status != "active" {
            return Err(AppError::new(&format!(
                "该实习生当前状态为「{}」,非 active,无法预分配",
                intern.status
            )));
        }

        if allocations.is_empty() {
            return Err(AppError::new("分配列表为空,至少需要 1 个月份"));
        }

        let now = chrono::Utc::now().timestamp();

        // 2) 处理每对 (month_index, department_id)
        for (month_index, department_id) in allocations {
            if *month_index < 1 {
                return Err(AppError::new(&format!(
                    "month_index 必须为 1-based 正整数,得到 {}",
                    month_index
                )));
            }
            if department_id.trim().is_empty() {
                return Err(AppError::new(&format!(
                    "month_index={} 的 department_id 不能为空",
                    month_index
                )));
            }

            // 查现有行
            let existing =
                RotationDao::find_by_intern_and_month(conn, intern_id, *month_index)?;
            match existing {
                Some(r) if r.status == "confirmed" || r.status == "completed" => {
                    return Err(AppError::new(&format!(
                        "实习生 {} 第 {} 月当前状态为「{}」,已锁定,无法覆盖",
                        intern.name, month_index, r.status
                    )));
                }
                Some(r) if r.status == "pre_alloc" => {
                    // UPDATE department_id
                    conn.execute(
                        "UPDATE rotation_assignments SET department_id=?1, updated_at=?2 WHERE id=?3",
                        rusqlite::params![department_id, now, r.id],
                    )?;
                }
                _ => {
                    // INSERT 新行,start/end 为 NULL — 由后续 approved/completed 流程刷新
                    let new_id = uuid::Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO rotation_assignments (id, intern_id, department_id, month_index, start_date, end_date, status, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, NULL, NULL, 'pre_alloc', ?5, ?5)",
                        rusqlite::params![new_id, intern_id, department_id, month_index, now],
                    )?;
                }
            }
        }

        // 3) 重算并回写 interns.allocation_status(用 recompute 保持派生一致性)
        recompute_allocation_status(conn, intern_id)?;

        // 4) 写 operation_log
        LogDao::insert(
            conn,
            &OperationLog {
                id: uuid::Uuid::new_v4().to_string(),
                operator: operator.to_string(),
                action_type: "allocate_for_one_intern".to_string(),
                action_detail: serde_json::json!({
                    "intern_id": intern_id,
                    "intern_name": intern.name,
                    "months": allocations.len(),
                })
                .to_string(),
                created_at: now,
            },
        )?;

        Ok(())
    }
}