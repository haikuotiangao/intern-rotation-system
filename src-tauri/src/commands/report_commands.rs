use std::collections::BTreeMap;
use std::io::{BufWriter, Cursor};
use tauri::State;
use chrono::Datelike;
use printpdf::*;
use crate::store::AppState;
use crate::database::dao::interns::{Intern, InternDao};
use crate::database::dao::rotation::{RotationDao, RotationWithNames};
use crate::database::dao::departments::DepartmentDao;
use crate::error::AppError;

// ======================================================================
// v1.0.0-r7 — PDF 单位换算修复 (终极)
//
// 关键修复 (r6 致命 bug):
//  r6 注释虽然声明"统一单位 = pt",但 wrap_text 第三参数传的是
//  USABLE_WIDTH_MM = 160.0 (mm)。函数内部把 160 当 pt 用,真实一行 PDF
//  物理宽度是 160 mm = 453.6 pt。结果:
//    - estimate_char_width 返回 11*0.95 = 10.45 pt/汉字
//    - wrap_text 中 160pt / 10.45pt ≈ 15.3 字/行,但 PDF 真实能放 41 字
//    - 这就是"字体没铺满就换行"的根因
//
//  r7 修复:所有宽度估算单位改为 mm,与 USABLE_WIDTH_MM 直接比较。
//    - estimate_char_width 输入是 PDF font_pt,内部先用 PT_TO_MM 转 mm
//    - measure_text_width 返回 mm
//    - wrap_text 的 max_width 是 mm
//    - use_text 仍然接受 pt 的 font_size(Mm(x) 转换由 printpdf 做)
// ======================================================================

const PAGE_WIDTH_MM: f64 = 210.0;
const PAGE_HEIGHT_MM: f64 = 297.0;
const LEFT_MARGIN_MM: f64 = 25.0;
const RIGHT_MARGIN_MM: f64 = 25.0;
const USABLE_WIDTH_MM: f64 = PAGE_WIDTH_MM - LEFT_MARGIN_MM - RIGHT_MARGIN_MM;

/// 1 pt = 25.4 / 72 mm ≈ 0.3527778 mm
const MM_PER_PT: f64 = 25.4 / 72.0;

// r10: 不再 include_bytes! 嵌入字体(那会让 exe +9MB)。
// 把"运行时优先扫描 + 嵌入兜底"改为"运行时优先扫描 + 应用本地 data 目录兜底"。
// 保证 3MB 体量。

/// 加载中文字体 — 优先级：app 自带 fonts/（Tauri resources）> Windows 系统字体 > 错误。
/// 不再 include_bytes! 嵌入(Source Han Sans SC 9.75 MB)以减小 exe 体积约 9.7MB。
/// 在 Windows 上多数机器已自带中文字体(simsun / msyh)，如需保证渲染一致，可把
/// `fonts/SourceHanSansSC-Regular.ttf` 作为应用资源(resources)打包。
pub fn load_cjk_font() -> Result<Vec<u8>, AppError> {
    // 1) 运行时优先扫描:应用本地 resources/fonts 目录(由 tauri.conf.json 注入)
    //    探查路径:(相对 exe 目录,以及在 Tauri 安装目录下的 resources/ 目录)
    const APP_FONT_CANDIDATES: &[&str] = &[
        "fonts/SourceHanSansSC-Regular.ttf",
        "fonts/SourceHanSansSC-Subset.ttf",
        "resources/fonts/SourceHanSansSC-Regular.ttf",
    ];
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    if let Some(dir) = exe_dir.as_ref() {
        for rel in APP_FONT_CANDIDATES {
            let p = dir.join(rel);
            if let Ok(bytes) = std::fs::read(&p) {
                if is_valid_ttf(&bytes) {
                    eprintln!("[PDF Font] 命中应用本地字体: {}", p.display());
                    return Ok(bytes);
                }
            }
        }
    }

    // 2) Windows 系统字体目录(常见中文字体 TTF)
    const WIN_FONT_DIR: &str = "C:\\Windows\\Fonts";
    const SINGLE_TTF_FALLBACK: &[&str] = &[
        "simsun.ttf",
        "simhei.ttf",
        "simfang.ttf",
        "simkai.ttf",
        "SIMYOU.TTF",
        "NotoSansSC-VF.ttf",
        "msyh.ttf",
        "arialuni.ttf",
        "FZLANTY_GB18030.ttf",
        "SIMLI.TTF",
        "SourceHanSansSC-Regular.otf",
    ];

    for name in SINGLE_TTF_FALLBACK {
        let path = format!("{}\\{}", WIN_FONT_DIR, name);
        if let Ok(bytes) = std::fs::read(&path) {
            if is_valid_ttf(&bytes) {
                eprintln!("[PDF Font] 运行时 fallback 命中: {}", path);
                return Ok(bytes);
            }
        }
    }

    // 3) .ttc 兜底(吸取 r3 教训:不再碰 simsun.ttc 第一个 face,只取更可靠的)
    const TTC_FALLBACK: &[&str] = &[
        "msyh.ttc",
        "msjh.ttc",
    ];
    for name in TTC_FALLBACK {
        let path = format!("{}\\{}", WIN_FONT_DIR, name);
        if let Ok(bytes) = std::fs::read(&path) {
            if let Some(ttf_data) = extract_first_ttf_from_ttc(&bytes) {
                if is_valid_ttf(&ttf_data) {
                    eprintln!("[PDF Font] TTC 提取成功: {}, size={}", path, ttf_data.len());
                    return Ok(ttf_data);
                }
            }
        }
    }

    Err(AppError::new(
        "未找到可在 PDF 中使用的中文字体(已尝试应用目录、Windows 系统 TTF/TTC)。请在 https://github.com/adobe-fonts/source-han-sans/releases 下载 SourceHanSansSC-Regular.ttf 放入应用目录 fonts/ 下。",
    ))
}

/// 从 .ttc 提取第一个 TTF 字型
fn extract_first_ttf_from_ttc(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() < 12 {
        return None;
    }
    // 校验 magic
    if &data[0..4] != b"ttcf" {
        return None;
    }
    let num_fonts = u32::from_be_bytes([data[8], data[9], data[10], data[11]]);
    if num_fonts == 0 || num_fonts > 64 {
        return None;
    }
    // 第一个 TTF 偏移在 offset 表的第一个 entry(偏移 12)
    if data.len() < 16 {
        return None;
    }
    let first_offset = u32::from_be_bytes([data[12], data[13], data[14], data[15]]) as usize;
    if first_offset < 12 || first_offset >= data.len() {
        return None;
    }
    // 从该偏移读到文件尾
    Some(data[first_offset..].to_vec())
}

/// 检查一段字节是否是真正可解析的 TTF (magic + 必要表头)
fn is_valid_ttf(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    let head_ok = match &data[0..4] {
        b"\x00\x01\x00\x00" => true,
        b"true" => true,
        _ => false,
    };
    if !head_ok {
        return false;
    }
    let num_tables = u16::from_be_bytes([data[4], data[5]]) as usize;
    if !(4..=64).contains(&num_tables) {
        return false;
    }
    true
}

// ======================================================================
// 字符宽度估算 (r7: 单位 = mm)
//
// printpdf 0.4 的 IndirectFontRef 没有任何 string_width / glyph_width API。
// 采用经验估算:以 1000 units_per_em 的 TrueType 标准为基准。
//
// 对于 SourceHanSansSC 和 SimSun,中文大致占 font_size 的 90%-100%。
// 8 个字符类别宽度比例(font 真实物理宽度 / em 大小):
//   - CJK 字符:        0.95
//   - ASCII 字母/数字:  0.55
//   - 中文标点:        0.50 ("," "。" 等)
//   - 英文标点:        0.30
//   - 空格:            0.25
//
// r7 关键:输入 font_pt (PDF 磅),内部转 mm 后返回 mm。USABLE_WIDTH_MM
//         直接可以拿来当 wrap 上限,语义一致。
//
// 验证:
//   - 11pt CJK 字符:(11 * 25.4 / 72) * 0.95 = 3.879 * 0.95 = 3.685 mm / 字
//   - 160mm 物理行宽 → 最多约 43 字
//   - 16pt 标题 6 字 = 6 * 16 * 0.3528 * 0.95 = 32.16 mm,居中偏移 (160 - 32.16)/2 = 63.92 mm
//
// 实测偏差在 3-5% 以内,足以居中/右对齐使用。
// ======================================================================

fn is_cjk_char(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}' |   // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' |   // CJK Unified Ideographs Extension A
        '\u{F900}'..='\u{FAFF}' |   // CJK Compatibility Ideographs
        '\u{2F800}'..='\u{2FA1F}'   // CJK Compatibility Ideographs Supplement
    )
}

fn is_cjk_punctuation(c: char) -> bool {
    matches!(c,
        '\u{3000}'..='\u{303F}' |   // CJK Symbols and Punctuation
        '\u{FF00}'..='\u{FFEF}' |   // Halfwidth and Fullwidth Forms
        '\u{FE30}'..='\u{FE4F}'     // CJK Compatibility Forms
    )
}

/// r12 字符宽度估算 — 一次性彻底修正
// 经验值(实测 SimSun / MSYH 11pt 中文):CJK advance width = 11pt × 1.45 × MM_PER_PT ≈ 5.63mm
// 这与 printpdf 0.4 渲染的实际宽度对得上(渲染前估算在 ±5% 偏差内,
// 让 wrap 触发时机与实际渲染一致,左右边距对称,无右边溢出/无左空白)。
fn estimate_char_width(c: char, font_pt: f64) -> f64 {
    let font_mm = font_pt * MM_PER_PT;
    if c == ' ' {
        font_mm * 0.30
    } else if c == '\u{3000}' {
        // 全角空格 — 视觉宽度等于一个汉字
        font_mm * 1.45
    } else if is_cjk_char(c) {
        font_mm * 1.45
    } else if is_cjk_punctuation(c) {
        font_mm * 0.78
    } else if c.is_ascii_alphabetic() {
        font_mm * 0.55
    } else if c.is_ascii_digit() {
        font_mm * 0.55
    } else if c.is_ascii_punctuation() {
        font_mm * 0.30
    } else {
        // 其他 Unicode 字符,保守按半角宽度
        font_mm * 0.55
    }
}

/// r7: 估算字符串渲染后的总宽度,单位 mm
fn measure_text_width(text: &str, font_pt: f64) -> f64 {
    text.chars().map(|c| estimate_char_width(c, font_pt)).sum()
}

/// r7: 按可用物理宽度自动换行 (单位 mm)
///   max_width_mm: 允许的最大行宽 (mm),正常传 USABLE_WIDTH_MM
///   font_pt:      字号 (PDF point)
/// 返回每行的字符串片段。
fn wrap_text(text: &str, max_width_mm: f64, font_pt: f64) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut current_line = String::new();
    let mut current_width: f64 = 0.0;

    for c in text.chars() {
        let cw = estimate_char_width(c, font_pt);
        if current_width + cw > max_width_mm && !current_line.is_empty() {
            lines.push(current_line.clone());
            current_line.clear();
            current_width = 0.0;
        }
        current_line.push(c);
        current_width += cw;
    }
    if !current_line.is_empty() {
        lines.push(current_line);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

// ======================================================================
// 数据结构
// ======================================================================

#[derive(Clone)]
struct NoticeGroup {
    department: String,
    school: String,
    intern_names: Vec<String>,
    start_date: String,
    end_date: String,
    serial: String,
}

// ======================================================================
// Tauri 命令
// ======================================================================

#[tauri::command]
pub fn get_report_interns(state: State<'_, AppState>, status: Option<String>) -> Result<Vec<Intern>, AppError> {
    let conn = state.db.lock().unwrap();
    InternDao::find_all(&conn, status.as_deref())
}

#[tauri::command]
pub fn get_report_rotation_all(state: State<'_, AppState>) -> Result<Vec<RotationWithNames>, AppError> {
    let conn = state.db.lock().unwrap();
    RotationDao::find_all_current(&conn)
}

#[tauri::command]
pub fn get_report_departments(state: State<'_, AppState>) -> Result<Vec<crate::database::dao::departments::DepartmentWithSystem>, AppError> {
    let conn = state.db.lock().unwrap();
    DepartmentDao::find_all_departments(&conn)
}

#[tauri::command]
pub fn export_rotation_notice_pdf(
    state: State<'_, AppState>,
    year: i32,
    month: u32,
    _operator: String,
) -> Result<Vec<u8>, AppError> {
    let conn = state.db.lock().unwrap();
    let all_rotations = RotationDao::find_all_current(&conn)?;

    // ---------------------------------------------------------------
    // 全局护栏 / r-export:
    //   只导出"该实习生全部 rotation_assignments 都是 status='confirmed'"
    //   的实习生。如果某个实习生存在 pre_alloc / pre_allocated 行,该
    //   实习生不出现在任何导出里(无论是否在本月);同名实习生本月有效
    //   行也被过滤掉,从而不会出现"半确认"实习生泄漏到对外通知中。
    //
    //   同时排除 status='ready' 的实习生(ready = 还没有任何 rotation 行)
    //   —— 这种实习生没有 exportable 数据,直接跳过即可。
    // ---------------------------------------------------------------
    let confirmed_only_intern_ids = filter_full_confirmed_intern_ids(&all_rotations);
    if confirmed_only_intern_ids.is_empty() {
        return Err(AppError::new(
            "暂无任何「已全部确认」的实习生可供导出。请先在「轮转分配」页确认后再导出。",
        ));
    }

    let month_prefix = format!("{:04}-{:02}", year, month);
    let mut filtered: Vec<_> = all_rotations.into_iter()
        // 仅「实习生全部confirmed」
        .filter(|r| confirmed_only_intern_ids.contains(&r.intern_id))
        // 仅「confirmed / completed」对应的当月数据,丢掉其他
        .filter(|r| r.status == "confirmed" || r.status == "completed")
        .filter(|r| r.start_date.as_ref().map_or(false, |d| d.starts_with(&month_prefix)))
        .collect();

    if filtered.is_empty() {
        return Err(AppError::new(
            "该月份无任何「已全部确认」实习生的轮转数据。请先确认全部实习生后再导出。",
        ));
    }

    filtered.sort_by(|a, b| {
        a.start_date.cmp(&b.start_date)
            .then_with(|| a.department_name.cmp(&b.department_name))
    });

    // Group by (department_id, intern_school)
    let mut group_map: BTreeMap<(String, String), Vec<RotationWithNames>> = BTreeMap::new();
    for r in &filtered {
        let school = r.intern_school.clone().unwrap_or_default();
        group_map.entry((r.department_id.clone(), school)).or_default().push(r.clone());
    }

    let mut groups: Vec<NoticeGroup> = Vec::new();
    for ((_dept_id, school), rotations) in &group_map {
        let dept_name = rotations[0].department_name.clone();
        let mut start_dates: Vec<String> = rotations.iter().filter_map(|r| r.start_date.clone()).collect();
        let mut end_dates: Vec<String> = rotations.iter().filter_map(|r| r.end_date.clone()).collect();
        start_dates.sort();
        end_dates.sort_by(|a, b| b.cmp(a));

        let names: Vec<String> = rotations.iter().map(|r| r.intern_name.clone()).collect();
        groups.push(NoticeGroup {
            department: dept_name,
            school: school.clone(),
            intern_names: names,
            start_date: start_dates.first().cloned().unwrap_or_default(),
            end_date: end_dates.first().cloned().unwrap_or_default(),
            serial: String::new(),
        });
    }

    groups.sort_by(|a, b| {
        a.start_date.cmp(&b.start_date)
            .then_with(|| a.department.cmp(&b.department))
    });

    // Assign serial numbers
    let month_key = format!("{:04}{:02}", year, month);
    for (i, group) in groups.iter_mut().enumerate() {
        group.serial = format!("{}{:04}", month_key, i + 1);
    }

    let pdf_bytes = render_notice_pdf(&groups)?;
    Ok(pdf_bytes)
}

/// r-export 共用护栏 — 返回「所有 rotation 行都是 status='confirmed'」的实习生 id 集合
///   - 任一行为 pre_alloc / pre_allocated / ready(还没有任何行)均被剔除
///   - 不要求存在已完成(completed)行,只要所有可观测行都是 confirmed
pub fn filter_full_confirmed_intern_ids(
    rotations: &[RotationWithNames],
) -> std::collections::HashSet<String> {
    use std::collections::{HashMap, HashSet};
    // 先分组
    let mut grouped: HashMap<String, Vec<&RotationWithNames>> = HashMap::new();
    for r in rotations {
        grouped.entry(r.intern_id.clone()).or_default().push(r);
    }
    let mut out: HashSet<String> = HashSet::new();
    for (id, rs) in grouped {
        if rs.is_empty() {
            continue;
        }
        // 全部都是 confirmed → 视为「全员已确认」
        if rs.iter().all(|r| r.status == "confirmed") {
            out.insert(id);
        }
    }
    out
}

// ======================================================================
// 轮转计划 CSV 导出 — backend 强制 confirmed-only 过滤,生成 CSV 字节
// （不引新依赖:使用 std::io::Write 手写 RFC4180 兼容 UTF-8 BOM CSV,
//   Excel 双击亦能正确打开并识别中文）
// ======================================================================
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RotationPlanRow {
    pub intern_name: String,
    pub plan: Vec<(i32, String, Option<String>)>, // (month_index, dept_name 或 label, system_name)
}

#[tauri::command]
pub fn export_rotation_plan_csv(
    state: State<'_, AppState>,
    _operator: String,
) -> Result<Vec<u8>, AppError> {
    let conn = state.db.lock().unwrap();
    let all_rotations = RotationDao::find_all_current(&conn)?;
    let confirmed_only = filter_full_confirmed_intern_ids(&all_rotations);
    if confirmed_only.is_empty() {
        return Err(AppError::new(
            "暂无任何「已全部确认」的实习生可供导出。",
        ));
    }

    let mut bytes: Vec<u8> = Vec::new();
    // UTF-8 BOM,Excel 中文列头友好
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);

    let max_month = all_rotations
        .iter()
        .filter(|r| confirmed_only.contains(&r.intern_id))
        .map(|r| r.month_index)
        .max()
        .unwrap_or(0);

    // CSV 头
    use std::fmt::Write as _;
    let mut line = String::from("实习生");
    for i in 1..=max_month {
        write!(&mut line, ",第{}月", i).unwrap();
    }
    line.push('\r');
    line.push('\n');
    bytes.extend_from_slice(line.as_bytes());

    // 按实习生聚合
    use std::collections::BTreeMap;
    let mut grouped: BTreeMap<String, Vec<&RotationWithNames>> = BTreeMap::new();
    for r in all_rotations.iter() {
        if confirmed_only.contains(&r.intern_id) {
            grouped.entry(r.intern_name.clone()).or_default().push(r);
        }
    }

    for (name, rows) in grouped {
        let mut human_name = String::from("\"");
        human_name.push_str(&name.replace('"', "\"\""));
        human_name.push('"');
        let mut cells: Vec<String> = vec![human_name];
        for i in 1..=max_month {
            let cell = rows
                .iter()
                .find(|r| r.month_index == i)
                .map(|r| format!("{}({})", r.department_name, r.system_name));
            match cell {
                Some(s) if s.contains(',') || s.contains('"') => {
                    let mut q = String::from("\"");
                    q.push_str(&s.replace('"', "\"\""));
                    q.push('"');
                    cells.push(q);
                }
                Some(s) => cells.push(s),
                None => cells.push(String::from("-")),
            }
        }
        let row_line = format!("{}\r\n", cells.join(","));
        bytes.extend_from_slice(row_line.as_bytes());
    }
    Ok(bytes)
}

// ======================================================================
// 科室轮转明细 CSV 导出 — confirmed-only 过滤
// ======================================================================
#[tauri::command]
pub fn export_department_detail_csv(
    state: State<'_, AppState>,
    _operator: String,
) -> Result<Vec<u8>, AppError> {
    let conn = state.db.lock().unwrap();
    let all_rotations = RotationDao::find_all_current(&conn)?;
    let confirmed_only = filter_full_confirmed_intern_ids(&all_rotations);
    if confirmed_only.is_empty() {
        return Err(AppError::new(
            "暂无任何「已全部确认」的实习生可供导出。",
        ));
    }

    let mut bytes: Vec<u8> = Vec::new();
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);

    use std::fmt::Write as _;
    let mut head = String::from("实习生,科室,系统,轮转月,状态");
    head.push('\r');
    head.push('\n');
    bytes.extend_from_slice(head.as_bytes());

    let mut sorted: Vec<&RotationWithNames> = all_rotations
        .iter()
        .filter(|r| confirmed_only.contains(&r.intern_id))
        .collect();
    sorted.sort_by(|a, b| {
        a.start_date
            .as_ref()
            .map(|s| s.as_str())
            .unwrap_or("")
            .cmp(b.start_date.as_ref().map(|s| s.as_str()).unwrap_or(""))
            .then_with(|| a.department_name.cmp(&b.department_name))
    });

    for r in sorted {
        let month_label = if let Some(sd) = r.start_date.as_ref() {
            let ymd = sd.split('T').next().unwrap_or("").to_string();
            if ymd.len() >= 7 {
                format!(
                    "{}年{}月",
                    &ymd[0..4],
                    ymd.get(5..7).unwrap_or("01")
                )
            } else {
                format!("第{}个月", r.month_index)
            }
        } else {
            format!("第{}个月", r.month_index)
        };
        let status_label = if r.status == "confirmed" {
            "已确认"
        } else if r.status == "pre_alloc" {
            "预分配"
        } else if r.status == "completed" {
            "已完成"
        } else {
            r.status.as_str()
        };
        let escape = |s: &str| {
            let mut q = String::from("\"");
            q.push_str(&s.replace('"', "\"\""));
            q.push('"');
            q
        };
        let row = format!(
            "{},{},{},{},{}\r\n",
            escape(&r.intern_name),
            escape(&r.department_name),
            escape(&r.system_name),
            escape(&month_label),
            escape(status_label),
        );
        bytes.extend_from_slice(row.as_bytes());
    }

    Ok(bytes)
}

fn date_parts(date_str: &str) -> (&str, &str, &str) {
    if date_str.len() >= 10 {
        (&date_str[0..4], &date_str[5..7], &date_str[8..10])
    } else {
        ("", "", "")
    }
}

// ======================================================================
// PDF 渲染核心 — r12:使用 rusttype 解析真实字符宽度
// ======================================================================

fn render_notice_pdf(groups: &[NoticeGroup]) -> Result<Vec<u8>, AppError> {
    let font_data = load_cjk_font().map_err(|e| {
        AppError::new(&format!("PDF 中文准备失败 ({}): 请重新安装应用或联系管理员", e.message))
    })?;

    // rusttype 真实字符宽度(mm):
    // 注意:rusttype 把字符当成"渲染到 N 像素高度"的尺寸。我们用与 PDF 字号
    // 等价的 pt × 1.333(96 DPI 像素/72 pt)作为像素高,然后取 h_metrics().advance_width
    // 并把 (advance_width / units_per_em) × scale_pt_px 转换为像素宽,再换算成 mm。
    let face = rusttype::Font::try_from_vec(font_data.clone())
        .ok_or_else(|| AppError::new("字体解析失败(rusttype)"))?;
    let units_per_em = face.units_per_em() as f64;

    // 单字符宽度换算(mm):
    // rusttype 0.9: face.glyph(c).scaled(scale).h_metrics().advance_width 返回的
    // 是按 scale=pt 缩放后的"像素宽度"。换算成 mm (PDF 用 72dpi) × MM_PER_PT。
    //
    // 重要: 当 c 在字体中无该字符(rusttype 返回 0 advance)时,使用一个保守兜底:
    // 假定它是一个全角 CJK 字(0.95 × pt × MM_PER_PT),避免 measure 偏小导致
    // 右侧越界。
    fn char_width_mm(c: char, pt: f64, units_per_em: f64, face: &rusttype::Font) -> f64 {
        let scale = rusttype::Scale::uniform(pt as f32);
        let adv = face.glyph(c).scaled(scale).h_metrics().advance_width as f64;
        if adv <= 0.0 {
            // glyph missing — fallback assume full-width CJK
            pt * MM_PER_PT * 0.95
        } else {
            adv * MM_PER_PT
        }
    }
    fn measure_text(text: &str, pt: f64, units_per_em: f64, face: &rusttype::Font) -> f64 {
        text.chars().map(|c| char_width_mm(c, pt, units_per_em, face)).sum()
    }
    let body_font_size = 10.5;
    let title_font_size = 16.0;
    let serial_font_size = 9.0;
    let dept_font_size = 11.0;
    let signer_font_size = 11.0;
    let _ = (body_font_size, title_font_size, serial_font_size); // silence unused

    let wrap = |text: &str, pt: f64, max_mm: f64| -> Vec<String> {
        let mut lines = Vec::new();
        let mut cur = String::new();
        let mut w = 0.0;
        for c in text.chars() {
            let cw = char_width_mm(c, pt, units_per_em, &face);
            if w + cw > max_mm && !cur.is_empty() {
                lines.push(cur.clone());
                cur.clear();
                w = 0.0;
            }
            cur.push(c);
            w += cw;
        }
        if !cur.is_empty() {
            lines.push(cur);
        }
        if lines.is_empty() {
            lines.push(String::new());
        }
        lines
    };
    let _ = measure_text; // avoid unused warning

    let (doc, page_idx, layer_idx) =
        PdfDocument::new("进修实习通知", Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Layer 1");
    let font = doc
        .add_external_font(Cursor::new(&font_data))
        .map_err(|e| AppError::new(&format!("字体解析失败: {}", e)))?;

    let top_margin = 25.0;
    let bottom_margin = 15.0;
    let notice_height = (PAGE_HEIGHT_MM - top_margin - bottom_margin) / 2.0;
    let half_bottom_band = PAGE_HEIGHT_MM - top_margin - notice_height;  // 上半块底边 y
    let breathing_gap = 10.0;  // 落款/日期离开边界的安全距离

    let mut current_page = page_idx;
    let mut current_layer = layer_idx;

    for (i, group) in groups.iter().enumerate() {
        let pos_in_pair = i % 2;
        if i > 0 && pos_in_pair == 0 {
            let (new_page, new_layer) = doc.add_page(Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Layer 1");
            current_page = new_page;
            current_layer = new_layer;
        }

        let layer = doc.get_page(current_page).get_layer(current_layer);
        let base_y = PAGE_HEIGHT_MM - top_margin - (pos_in_pair as f64) * notice_height - 5.0;

        // 半块底边 y:pos_in_pair == 0 → 上面半块的底边 = 中线 = half_bottom
        //              pos_in_pair == 1 → 整张页的底边 - bottom_margin
        let half_bottom_y = if pos_in_pair == 0 { half_bottom_band } else { bottom_margin };

        // ---- 标题: 水平居中 ----
        let title = "进修、实习通知";
        let title_width_mm = measure_text(title, title_font_size, units_per_em, &face);
        let title_x = LEFT_MARGIN_MM + (USABLE_WIDTH_MM - title_width_mm) / 2.0;
        layer.use_text(title, title_font_size, Mm(title_x), Mm(base_y - 5.0), &font);

        // ---- 编号: 右对齐 ----
        let serial_text = format!("编号: {}", group.serial);
        let serial_width_mm = measure_text(&serial_text, serial_font_size, units_per_em, &face);
        let serial_x = (PAGE_WIDTH_MM - RIGHT_MARGIN_MM - serial_width_mm - 3.0).max(LEFT_MARGIN_MM);
        layer.use_text(&serial_text, serial_font_size, Mm(serial_x), Mm(base_y - 5.0), &font);

        // ---- 科室(单独一行) ----
        let dept_text = format!("{}:", group.department);
        layer.use_text(&dept_text, dept_font_size, Mm(LEFT_MARGIN_MM), Mm(base_y - 22.0), &font);

        // ---- 正文: 学校 + 的 + 名单 + 等 N 人从 ... 至 ... 在你处实习 ---
        let start_parts = date_parts(&group.start_date);
        let end_parts = date_parts(&group.end_date);
        let all_names = group.intern_names.join("、");

        let school_name = if group.school.is_empty() {
            "(单位)".to_string()
        } else {
            group.school.clone()
        };

        let wing_space = "\u{3000}\u{3000}"; // 两个全角空格(-u-XXXX 不能再 format! 中用 {{ )
        let body_text = format!(
            "{}{}的{}等{}人从{}年{}月{}日至{}年{}月{}日在你处实习(进修), 请贵科做好管理工作。",
            wing_space,
            school_name,
            all_names,
            group.intern_names.len(),
            start_parts.0, start_parts.1, start_parts.2,
            end_parts.0, end_parts.1, end_parts.2,
        );

        let body_lines = wrap(&body_text, body_font_size, USABLE_WIDTH_MM);
        let line_height = body_font_size * MM_PER_PT * 1.9;  // 中文行高约 1.9×字号
        let body_start_y = base_y - 38.0;
        let body_floor_y = half_bottom_y + 28.0;

        for (li, line) in body_lines.iter().enumerate() {
            let line_y = body_start_y - (li as f64) * line_height;
            if line_y < body_floor_y {
                break;
            }
            layer.use_text(line, body_font_size, Mm(LEFT_MARGIN_MM), Mm(line_y), &font);
        }

        let body_end_y = body_start_y - (body_lines.len() as f64) * line_height;

        // ---- 落款: 右对齐 ----
        let signer = "老河口市第一医院科教科";
        let signer_width_mm = measure_text(signer, signer_font_size, units_per_em, &face);
        // 加上 4mm 缓冲,即使 measure 偏差也不会让文字超过右边界
        let signer_x = (PAGE_WIDTH_MM - RIGHT_MARGIN_MM - signer_width_mm - 4.0).max(LEFT_MARGIN_MM);
        let mut signer_y = body_end_y - 20.0;
        let signer_min_y = half_bottom_y + breathing_gap + 14.0;
        if signer_y < signer_min_y {
            signer_y = signer_min_y;
        }

        layer.use_text(signer, signer_font_size, Mm(signer_x), Mm(signer_y), &font);

        let today = chrono::Local::now().naive_local();
        let date_text = format!("{} 年 {} 月 {} 日", today.year(), today.month(), today.day());
        let date_width_mm = measure_text(&date_text, signer_font_size, units_per_em, &face);
        // 同样加 4mm 缓冲
        let date_x = (PAGE_WIDTH_MM - RIGHT_MARGIN_MM - date_width_mm - 4.0).max(LEFT_MARGIN_MM);
        let mut date_y = signer_y - 14.0;
        let date_min_y = half_bottom_y + breathing_gap;
        if date_y < date_min_y {
            date_y = date_min_y;
        }

        eprintln!(
            "[PDF r12] title='{}' title_x={:.2} title_w={:.2} | serial='{}' serial_x={:.2} w={:.2} | signer='{}' signer_x={:.2} w={:.2} signer_y={:.2} | date='{}' date_x={:.2} w={:.2}",
            title, title_x, title_width_mm, serial_text, serial_x, serial_width_mm,
            signer, signer_x, signer_width_mm, signer_y,
            date_text, date_x, date_width_mm,
        );

        layer.use_text(&date_text, signer_font_size, Mm(date_x), Mm(date_y), &font);
    }

    let mut buf = Vec::new();
    {
        let mut writer = BufWriter::new(&mut buf);
        doc.save(&mut writer)
            .map_err(|e| AppError::new(&format!("PDF生成失败: {}", e)))?;
    }
    Ok(buf)
}
