use rusqlite::{Connection, params};
use crate::error::AppError;

pub fn initialize_database(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS department_systems (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_rotation INTEGER NOT NULL DEFAULT 1,
            rotation_interval INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system_id TEXT NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 3,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (system_id) REFERENCES department_systems(id)
        );

        CREATE TABLE IF NOT EXISTS interns (
            id TEXT PRIMARY KEY,
            class_name TEXT NOT NULL,
            name TEXT NOT NULL,
            gender TEXT,
            phone TEXT,
            parent_phone TEXT,
            graduate_school TEXT,
            remarks TEXT,
            duration_months INTEGER NOT NULL DEFAULT 6,
            start_date TEXT NOT NULL,
            end_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            fixed_department_id TEXT,
            allocation_status TEXT NOT NULL DEFAULT 'ready',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (fixed_department_id) REFERENCES departments(id)
        );

        CREATE TABLE IF NOT EXISTS rotation_assignments (
            id TEXT PRIMARY KEY,
            intern_id TEXT NOT NULL,
            department_id TEXT NOT NULL,
            month_index INTEGER NOT NULL,
            start_date TEXT,
            end_date TEXT,
            status TEXT NOT NULL DEFAULT 'pre_alloc',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (intern_id) REFERENCES interns(id),
            FOREIGN KEY (department_id) REFERENCES departments(id),
            UNIQUE(intern_id, month_index)
        );

        CREATE TABLE IF NOT EXISTS operation_logs (
            id TEXT PRIMARY KEY,
            operator TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_detail TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_interns_status ON interns(status);
        CREATE INDEX IF NOT EXISTS idx_interns_class ON interns(class_name);
        CREATE INDEX IF NOT EXISTS idx_interns_name ON interns(name);
        -- idx_interns_allocation 必须放在 initialize_database 末尾按列存在性创建:
        -- 对 v1.0.0 老库,CREATE TABLE IF NOT EXISTS 不会重建表,如果直接 inline 在这里,
        -- 在已经创建好新表但尚未 ALTER 的中间态,或反向顺序,都可能让老 db panic。
        -- 解决:迁到下面 initialize_database 末尾,先 migrate 再据列存在性决定是否建索引。
        CREATE INDEX IF NOT EXISTS idx_rotation_intern ON rotation_assignments(intern_id);
        CREATE INDEX IF NOT EXISTS idx_rotation_department ON rotation_assignments(department_id);
        CREATE INDEX IF NOT EXISTS idx_rotation_status ON rotation_assignments(status);
        CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);
    ")?;

    migrate_schema(conn)?;
    init_default_data(conn)?;
    // 老升级数据(/v1.0.0 升级上来的库)虽然在 ALTER 时已经默认 'ready',
    // 这里再做一次校正,确保根据 historical rotation_assignments 派生出的真实值:
    // 仅当 allocation_status 列真正存在时才跑(否则会 no such column 再次 panic)
    //
    // r17: 用 settings.migration_recompute_done 标记控制 — 已迁移过一次后,启动期不再扫全表。
    //      第一次迁移成功后写 true,后续启动直接跳过,避免每个进程初始化都做一次 O(N) UPDATE。
    if has_column(conn, "interns", "allocation_status")?
        && !migration_recompute_done(conn)?
    {
        recompute_allocation_status_all(conn)?;
        let _ = set_migration_recompute_done(conn, true);
    }

    // 兜底创建索引 — 必须在 migrate_schema() 之后执行,因为只有这时分配状态列
    // 才在老库里被 ALTER 出来。此处带 has_column 守卫,绝不在缺列时尝试建索引。
    if has_column(conn, "interns", "allocation_status")? {
        // 再次创建前先 drop 老索引(若存在),避免同名冲突;
        // IF NOT EXISTS 已经处理了重复创建,但若用户在迁移前手动建过坏索引,清理一下。
        conn.execute_batch("DROP INDEX IF EXISTS idx_interns_allocation;").ok();
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_interns_allocation ON interns(allocation_status);").ok();
    }
    Ok(())
}

/// 安全检测某列是否存在的辅助函数(用于 migration 阶段性判断)。
fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
    // PRAGMA table_info(table) 返回 cid, name, type, notnull, dflt_value, pk
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn migrate_schema(conn: &Connection) -> Result<(), AppError> {
    // 老 ALTER 用 `.ok()` 吞掉 duplicate column name 错误,这是 SQLite 不支持
    // "ADD COLUMN IF NOT EXISTS 限制下的唯一可行做法。所有被支持的 SQLite 版本
    // (>= 3.25) 都允许 ADD COLUMN 添加含 DEFAULT 的 NOT NULL 列。

    // 1) 老 v1.0.0 之前的字段
    conn.execute_batch("ALTER TABLE department_systems ADD COLUMN is_rotation INTEGER NOT NULL DEFAULT 1;").ok();
    conn.execute_batch("ALTER TABLE department_systems ADD COLUMN rotation_interval INTEGER NOT NULL DEFAULT 1;").ok();
    conn.execute_batch("ALTER TABLE interns ADD COLUMN fixed_department_id TEXT;").ok();
    conn.execute_batch("ALTER TABLE interns ADD COLUMN end_date TEXT;").ok();

    // 2) 仅当 allocation_status 列不存在时才 ALTER(防止 duplicate column)
    if !has_column(conn, "interns", "allocation_status")? {
        conn.execute_batch("ALTER TABLE interns ADD COLUMN allocation_status TEXT NOT NULL DEFAULT 'ready';")?;
    }

    // 3) 独立创建索引 — 老库可能没有 idx_interns_status、idx_rotation_* 等,
    // 这里逐条 IF NOT EXISTS 兜底。
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_interns_status ON interns(status);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_interns_class ON interns(class_name);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_interns_name ON interns(name);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_rotation_intern ON rotation_assignments(intern_id);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_rotation_department ON rotation_assignments(department_id);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_rotation_status ON rotation_assignments(status);").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);").ok();

    // 4) allocation_status 索引已迁到 initialize_database() 末尾统一按列存在性创建,
    // 见下面 — 这里不再处理,避免双重创建/顺序错乱。
    Ok(())
}

fn init_default_data(conn: &Connection) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM department_systems", [], |row| row.get(0)
    )?;
    if count == 0 {
        conn.execute("INSERT INTO department_systems (id, name, sort_order) VALUES (?1, ?2, ?3)",
            &[&uuid::Uuid::new_v4().to_string(), &"内科系统".to_string(), &"0".to_string()])?;
        conn.execute("INSERT INTO department_systems (id, name, sort_order) VALUES (?1, ?2, ?3)",
            &[&uuid::Uuid::new_v4().to_string(), &"外科系统".to_string(), &"1".to_string()])?;
    }
    Ok(())
}

/// 重新派生单个实习生的 allocation_status (基于 rotation_assignments + intern.end_date)。
/// 派生优先级:
///   - rotation 记录数为 0  → 'ready'
///   - 存在 pre_alloc 且不存在 confirmed/completed → 'pre_allocated'
///   - 仅 confirmed/completed (无 pre_alloc) → 'confirmed'
///   - 既有 pre_alloc 又有 confirmed/completed → 'pre_allocated' (等下次全部 confirmed)
///   - 若已结束 (end_date < 今天) 且全部 confirmed → 'completed'
///
/// 仅在已初始化新字段后调用(不创建缺列);启动时 recompute_all 走此函数为每个 active intern 重新校正。
pub fn derive_allocation_status_for_intern(conn: &Connection, intern_id: &str) -> Result<(), AppError> {
    // 拉取 intern 的 end_date 用于判断已结束
    let end_date: Option<String> = conn
        .query_row(
            "SELECT end_date FROM interns WHERE id=?1",
            params![intern_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    // 统计 rotation 记录
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
        // 还有未锁定的 → 维持 pre_allocated
        "pre_allocated"
    } else {
        // 全部确认/已完成
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

/// 启动时调用 — 遍历全表,根据现有 rotation 记录重新派生每一个 intern 的 allocation_status。
/// 用于老升级数据初始化。
pub fn recompute_allocation_status_all(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id FROM interns")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
        let id = row?;
        if let Err(e) = derive_allocation_status_for_intern(conn, &id) {
            eprintln!("[schema] recompute allocation_status 失败 intern={} err={:?}", id, e);
        }
    }
    Ok(())
}

/// 读取 settings.migration_recompute_done。用于启动期决定是否再做一次全表 recompute。
/// 缺值 → false(老库未迁移过,需要跑一次)。
fn migration_recompute_done(conn: &Connection) -> Result<bool, AppError> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key=?1")?;
    let mut rows = stmt.query_map(["migration_recompute_done"], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(Ok(val)) => Ok(val == "true" || val == "1"),
        _ => Ok(false),
    }
}

/// 标记 settings.migration_recompute_done = true,启动期下次启动将跳过全表 recompute。
fn set_migration_recompute_done(conn: &Connection, done: bool) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params!["migration_recompute_done", if done { "true" } else { "false" }],
    )?;
    Ok(())
}
