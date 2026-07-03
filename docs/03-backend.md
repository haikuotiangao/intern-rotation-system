# 03 · Rust 后端

> Tauri + Rust 后端的分层实现。所有外部可调用命令在 `lib.rs` 中注册。

## 1. 模块入口与启动

[`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) 是后端入口：

```rust
pub fn run() {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("无法打开数据库");
    initialize_database(&conn).expect("数据库初始化失败");
    let app_state = AppState::new(conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![/* 38 commands */])
        .run(tauri::generate_context!())
        .expect("启动失败");
}
```

启动时执行：
1. **打开 / 创建** SQLite 数据库
2. **建表 + 迁移 + 默认数据**
3. **注册 Tauri 插件**（dialog, fs）
4. **托管** AppState
5. **注册** 38 条 IPC 命令

## 2. 分层架构

```
┌─────────────────────────────────────────┐
│ commands/                               │  ←  #[tauri::command] 入口
│ (intern, department, rotation,          │
│  archive, settings, report)             │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ services/                               │  ←  业务逻辑（日志埋点）
│ (intern_service, rotation_service, ...)│
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ database/dao/                           │  ←  SQL 原子操作
│ (interns, departments, rotation, ...)   │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│ SQLite (rusqlite)                       │
└─────────────────────────────────────────┘
```

**优点**：commands 极薄（5~10 行），所有业务规则收敛在 services，SQL 单条原子操作收敛在 dao。

## 3. 错误处理

[`src-tauri/src/error.rs`](../../src-tauri/src/error.rs)：

```rust
#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl From<rusqlite::Error> for AppError { /* → "数据库错误: {e}" */ }
impl From<bcrypt::BcryptError> for AppError { /* → "密码加密错误: {e}" */ }
```

- 自动为 `?` 算子提供转换
- `Serialize` 保证能通过 IPC 返回前端
- 前端 `toast.error(e.message)` 直接显示

## 4. DAO 层（数据访问对象）

每个数据实体都有一个 `XxxDao` 结构，所有方法 `pub fn` 加 `&Connection`：

```rust
pub struct InternDao;
impl InternDao {
    pub fn insert(conn: &Connection, intern: &Intern) -> Result<(), AppError>;
    pub fn update(conn: &Connection, intern: &Intern) -> Result<(), AppError>;
    pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError>;
    // ...
}
```

> `delete` 方法内会先清理关联的 `rotation_assignments`（避免外键约束失败）。

### DAO 子模块

| 文件 | 主要实体与核心方法 |
| --- | --- |
| `dao/interns.rs` | `Intern` + CRUD/搜索/批量导入 |
| `dao/departments.rs` | `DepartmentSystem`、`Department`、`DepartmentWithSystem` + 系统/科室 CRUD |
| `dao/rotation.rs` | `RotationAssignment`、`RotationWithNames` + 左连接三表查询 |
| `dao/logs.rs` | `OperationLog` + 全量/按类型分页查询 |
| `dao/settings.rs` | KV 存储（`get` / `set` / `get_i64` / `get_bool`） |

> 完整方法索引见 [backend/dao-map.md](./backend/dao-map.md)。

## 5. Service 层（业务逻辑）

每个 module 暴露一个 `pub struct XxxService;` + 一组静态方法。

### 5.1 intern_service.rs

```rust
pub struct InternService;
impl InternService {
    pub fn create     (conn, intern, operator) -> Result<Intern>
    pub fn update     (conn, intern, operator) -> Result<Intern>
    pub fn delete     (conn, id, operator)    -> Result<()>
    pub fn batch_import(conn, &[intern], operator) -> Result<i32>
    pub fn find_all   (conn, status)         -> Result<Vec<Intern>>
    pub fn find_by_id (conn, id)             -> Result<Option<Intern>>
    pub fn search     (conn, keyword, status) -> Result<Vec<Intern>>
    pub fn count_active(conn)                -> Result<i64>
}
```

**所有写操作都自动产生一条 `operation_log`**，`operator` 由前端传入（当前固定为 `"管理员"`）。

### 5.2 department_service.rs

类似结构，`create/update/delete` 自动产生日志，删除受外键保护：

```rust
// 删除系统前
let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM departments WHERE system_id=?1",
    params![id], |row| row.get(0)
)?;
if count > 0 {
    return Err(AppError::new("该系统下还有科室，无法删除"));
}
```

### 5.3 rotation_service.rs （核心，450+ 行）

详见 [04-rotation-algorithm.md](./04-rotation-algorithm.md)。

关键方法：
- `pre_allocate(conn) -> Result<Vec<RotationWithNames>>` — 一键预分配所有实习生
- `manual_adjust(conn, assignment_id, new_dept_id, operator)` — 单条调整
- `confirm_allocation(conn, operator)` — 锁定方案（pre_alloc → confirmed）
- `reset_allocation(conn, operator)` — 清空预分配
- `get_by_intern / get_by_month / get_all_current` — 各种查询

### 5.4 archive_service.rs

```rust
pub struct ArchiveService;
impl ArchiveService {
    /// 自动归档（基于 end_date 或 start_date + duration 推断）
    pub fn auto_archive(conn) -> Result<i32, AppError>;

    /// 撤销归档（archived → active）
    pub fn restore_from_archive(conn, intern_id, operator) -> Result<()>;

    pub fn find_archived(conn) -> Result<Vec<Intern>>;
    pub fn search_archived(conn, keyword) -> Result<Vec<Intern>>;
}
```

### 5.5 settings_service.rs

```rust
pub struct SettingsService;
impl SettingsService {
    pub fn verify_password(conn, input)        -> Result<bool>     // bcrypt::verify
    pub fn set_password    (conn, password)    -> Result<()>       // bcrypt::hash 写入
    pub fn has_password    (conn)              -> Result<bool>     // 检查 key 是否存在
}
```

bcrypt cost = 10（安全性 vs 性能权衡）。

### 5.6 log_service.rs

```rust
pub struct LogService;
impl LogService {
    pub fn get_logs(conn, page, page_size, action_type: Option<&str>) -> Result<Vec<OperationLog>>;
    pub fn get_log_count(conn) -> Result<i64>;
}
```

## 6. Commands 层（Tauri IPC 入口）

每个命令都是非常薄的壳：

```rust
#[tauri::command]
pub fn get_interns(state: State<'_, AppState>, status: Option<String>) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    InternService::find_all(&conn, status.as_deref())
}
```

### 6.1 命令清单（共 38 个，分类索引）

详见 [reference/tauri-commands.md](./reference/tauri-commands.md)。

| 模块 | 命令数 | 典型命名 |
| --- | --- | --- |
| intern | 7 | `get_interns`, `create_intern`, ... |
| department | 9 | `get_departments`, `delete_department_system`, ... |
| rotation | 7 | `pre_allocate_rotation`, `confirm_allocation`, ... |
| archive | 4 | `auto_archive`, `restore_archive`, ... |
| settings | 6 | `verify_login`, `setup_password`, `change_password`, `get_operation_logs`, ... |
| report | 4 | `export_rotation_notice_pdf`, ... |

### 6.2 注册流程

```rust
// src-tauri/src/lib.rs （节选）
.invoke_handler(tauri::generate_handler![
    commands::intern_commands::get_interns,
    commands::intern_commands::create_intern,
    // ...
    commands::report_commands::export_rotation_notice_pdf,
])
```

**新增命令的标准动作：**
1. 在 `XxxService` 加业务方法
2. 在 `commands/Xxx_commands.rs` 加 `#[tauri::command]`
3. 在 `lib.rs` 的 `generate_handler!` 中注册
4. 在前端 `lib/api/Xxx.ts` 的 `invoke(...)` 调用
5. 在 `hooks/useXxx.ts` 暴露 React Query hook

## 7. PDF 生成（report_commands.rs）

```rust
#[tauri::command]
pub fn export_rotation_notice_pdf(
    state: State<'_, AppState>,
    year: i32,
    month: u32,
    operator: String,
) -> Result<Vec<u8>, AppError>;
```

### 7.1 流程
1. 拉取 `status IN ('confirmed', 'pre_alloc')` 的轮转记录
2. 按 `start_date` 前缀 `YYYY-MM` 过滤目标月份
3. 按 `(department_id, intern_school)` 分组
4. 排序、生成 `YYYYMM + 4位序号` 编号
5. 用 `printpdf` 输出 PDF 字节流

### 7.2 字体加载策略

```rust
// 候选路径顺序
"C:\\Windows\\Fonts\\simsun.ttc"
"C:\\Windows\\Fonts\\simsun.ttf"
"C:\\Windows\\Fonts\\msyh.ttc"
"C:\\Windows\\Fonts\\kaiu.ttf"
"C:\\Windows\\Fonts\\simfang.ttf"
"C:\\Windows\\Fonts\\msjh.ttc"
```

- 读 `ttc` 文件头判断，若是 `ttcf` 则提取第一份 TTF
- 任意一个命中即返回，否则 `AppError::new("未找到支持中文的字体文件")`

### 7.3 排版
- A4 (210×297mm)
- 同一页面上下两份通知单（`notice_height = (page_height - top_margin - bottom_margin) / 2`）
- 每份通知内容：标题、编号、科室、单位、正文、日期、医院落款

## 8. 调试输出

后端多处使用 `eprintln!` 输出诊断信息（`get_all_current_rotation`、`find_all_current`），调试时通过 `cargo tauri dev` 的 stderr 抓取。
生产构建可批量替换为 `log` crate（已就近提醒）。

## 9. Service 一览索引

完整方法表见 [backend/services-map.md](./backend/services-map.md)。
