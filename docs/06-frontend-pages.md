# 06 · 前端页面详解

> 9 个路由页面的职责、内部状态、关键交互、所调用的 hook 和 Tauri 命令。

## 页面路由总览

| 路径 | 文件 | 显示标题 |
| --- | --- | --- |
| `/` | `pages/CurrentInterns.tsx` | 当前实习 |
| `/archived` | `pages/ArchivedInterns.tsx` | 归档列表 |
| `/departments` | `pages/DepartmentMgmt.tsx` | 科室管理 |
| `/rotation` | `pages/RotationAllocation.tsx` | 轮转分配 |
| `/rotation-overview` | `pages/RotationOverview.tsx` | 轮转总览 |
| `/interns/:id` | `pages/InternDetailPage.tsx` | （动态标题） |
| `/history` | `pages/HistorySearch.tsx` | 信息检索 |
| `/reports` | `pages/Reports.tsx` | 报表导出 |
| `/logs` | `pages/OperationLogs.tsx` | 操作日志 |
| `/settings` | `pages/Settings.tsx` | 系统设置 |
| `*` | — | → 重定向到 `/` |

标题映射在 [`components/layout/Layout.tsx`](../../src/components/layout/Layout.tsx) 的 `pageTitles` 对象。

---

## 1. `CurrentInterns.tsx` — 当前实习

### 数据

| Hook | 数据 |
| --- | --- |
| `useDepartments` | 全部科室（用于解析 fixed_department_id → 科室名） |
| `useInterns("active")` | 当前实习中实习生 |
| `useSearchInterns` | 搜索结果（mutation） |

### 交互

- 页面挂载自动调用 `invoke("auto_archive")`，然后失效所有 `["interns"]` 缓存
- 防抖搜索 300ms 后切换为搜索模式
- 顶部按钮：
  - **新增**：打开 `InternForm + Modal`
  - **导入数据**：打开 `InternImport + Modal`
  - **下载模板**：调用 `XLSX` 生成两 sheet 的 Excel，调用 `save + writeFile`
  - **刷新按钮**：再次调用 `auto_archive` + `invalidateQueries`
- 卡片点击进 `/interns/:id`
- hover 显示编辑 / 删除按钮（`group-hover:opacity-100`）
- 班级筛选项在多于 1 个班级时出现

### 关键文件

```text
src/pages/CurrentInterns.tsx
src/components/interns/InternForm.tsx
src/components/interns/InternImport.tsx
src/components/ui/Modal.tsx
```

---

## 2. `ArchivedInterns.tsx` — 归档列表

### 数据

- `useArchivedInterns` — `status='archived'` 的实习生
- `useRestoreArchive` — 撤销归档（`status` 改回 `'active'`）
- `useUpdateIntern` — 撤销前提：先更新开始 / 结束日期
- `useRotationByIntern` — 详情模式加载该归档实习生的历史轮转记录

### 交互

- 顶部搜索框（实时过滤 `name` 与 `class_name`）
- 卡片点击进入详情面板
- 详情面板显示完整信息 + 折叠式轮转历史
- 「撤销归档」按钮：
  1. 弹出 Modal 让用户改开始 / 结束日期
  2. 先 `updateIntern.mutate` 改日期
  3. 再 `restoreArchive.mutate` 改状态

### 状态机

```text
list → click card → detail panel
              │
              └─ click "撤销归档"
                     ↓
                  Modal (改日期) → confirm
                     ↓
                update + restore → close + invalidate caches → list
```

---

## 3. `DepartmentMgmt.tsx` — 科室管理

### 数据

| Hook | 数据 |
| --- | --- |
| `useDepartments` | 全部启用科室 |
| `useDepartmentSystems` | 全部系统 |
| `useInterns("active")` | 当前实习生数（用于容量校验） |
| `useTotalCapacity` | Σ(capacity) 用于容量校验 |

### 交互

- 顶部「新增系统」按钮
- 警示条：当 Σ(capacity) < 实习生数时显示警告
- 每个系统卡片显示：
  - 系统名 + 「轮转 / 固定」徽章 + 「n 个月/轮」
  - 下属科室列表
  - 新增 / 编辑 / 删除按钮
- `Modal` 同时支持「系统 / 科室」表单，切换 `modalType` 控制字段显示
- 「固定科室」类型细节：仅 `is_rotation=false` 的系统下科室可作为轮转 / 固定的「固定科室」选项

### 关键字段

```text
formName · formSortOrder · formIsRotation · formRotationInterval · formSystemId · formCapacity
```

---

## 4. `RotationAllocation.tsx` — 轮转分配

> 是轮转算法的**主交互面**。

### 数据

- `useAllCurrentRotation` — 全部轮转记录
- `useDepartments` — 调整时的可选科室
- 四个 mutation：
  - `usePreAllocate` — 一键预分配
  - `useManualAdjust` — 调整单条
  - `useConfirmAllocation` — 确认分配
  - `useResetAllocation` — 重置预分配

### 视图

- 顶部摘要：实习生数 + 时间范围（自然月）
  - 例：`5 名待分配实习生 | 2026年7月 ~ 2027年3月`
- 状态徽章：「已确认」用绿色徽章
- 操作按钮：
  - **一键预分配**（任何人状态都可点）
  - **确认分配** 仅在有 `pre_alloc` 且无 `confirmed` 时显示
  - **重置** 仅在有 `pre_alloc` 且无 `confirmed` 时显示

### 矩阵表

- 行：实习生（按姓名首字母升序）
- 列：月份（与 `rotationStart` 偏移推算实际自然月）
- 单元格：所在科室名 + 系统，颜色按 `system_name` 哈希
- 未分配单元格显示 `—`
- 点击单元格（在 `pre_alloc` 状态）打开调整 Modal

### 「全部已确认」状态

- 如果某个实习生**所有月份都 `confirmed`**，则整个实习生不出现在待分配矩阵里，下方显示「已确认 X 名实习生」提示，让用户去「当前实习」页查看。

### 调整 Modal

字段：目标系统（先选系统）→ 目标科室（按系统过滤）→ 「确认调整」调用 `manual_adjust` 命令，写日志后失效 `rotation-current` 缓存。

### 错误处理

```typescript
const handlePreAllocate = () => {
  preAllocate.mutate(undefined, {
    onError: (e: any) => {
      const msg = e.message || "";
      if (msg.includes("UNIQUE") || msg.includes("constraint")) {
        setError("该实习生已有轮转记录，无需重复分配");
      } else {
        setError(msg || "预分配失败");
      }
    },
  });
};
```

---

## 5. `RotationOverview.tsx` — 轮转总览（甘特图）

### 数据

- `useAllCurrentRotation`
- `useInterns` （`status` 不传，取全部以补全班级与开始日期）

### 视图

- 左栏：实习生列表（可搜索）
- 右栏：横向甘特图
  - 列：所有出现的自然月（`YYYY-MM` 集合）
  - 行：每个实习生
  - 单元格：所在科室 + 起止日期 tooltip
  - 过去月份的单元格灰色「锁定」圆点
- 联动选中态：左栏 hover/点击与右栏高亮同步（`highlightedIntern` state）

### 关键派生逻辑

```typescript
const rotationStart = useMemo(() => {
  if (!rotations || rotations.length === 0) return null;
  return rotations.reduce<string | null>((earliest, r) => {
    if (r.start_date && (!earliest || r.start_date < earliest)) return r.start_date;
    return earliest;
  }, null);
}, [rotations]);

const allMonthKeys = useMemo(() => {
  // 从所有 rotation.start_date 解析 YYYY-MM
  // 若 start_date 缺失, 基于 rotationStart + month_index 推算
}, [rotations, rotationStart]);

const internRotationMap = useMemo(() => {
  // internId -> Map<monthKey, RotationWithNames>
}, [rotations, internRows, rotationStart]);
```

### 配色

```typescript
const colorPalette = {
  indigo: { bar: '...', text: '...', badge: '...' },
  rose: { ... },
  amber: ..., emerald: ..., violet: ..., cyan: ..., orange: ..., teal: ...
};
const systemColorLookup = { "内科": "indigo", "外科": "rose" };
function getColor(systemName) {
  const key = systemColorLookup[systemName] ||
    colorNames[hash(systemName) % colorNames.length];
  return colorPalette[key];
}
```

---

## 6. `InternDetailPage.tsx` — 实习生详情

### 数据

- `useIntern(id)` — 单条实习生
- `useRotationByIntern(id)` — 全部月份记录
- `useDepartments`, `useDepartmentSystems` — 全量（用于单位分组下拉）
- `useManualAdjust` — 单月调整

### 视图

- 顶部返回按钮
- 基础信息卡片（name、class、固定/轮转徽章、联系方式、毕业学校、生效日期、时长、状态、备注）
- 「已完成轮转」段：所有结束日 ≤ 今天的轮转记录（淡色背景）
- 「轮转计划」段：所有未来月份的轮转，可点击「调整」改为不同科室（带单位分组下拉）

### 时间线辅助函数

```typescript
function isCompleted(r: RotationWithNames): boolean {
  if (r.status === "completed") return true;
  if (r.end_date) return new Date(r.end_date) < new Date();
  return false;
}

function isFuture(r: RotationWithNames): boolean {
  if (r.status === "completed") return false;
  if (r.end_date) return new Date(r.end_date) >= new Date();
  return true;
}
```

---

## 7. `HistorySearch.tsx` — 信息检索

### 数据

- `useSearchInterns({ keyword })` — 搜索全部实习生（含已归档）
- `useRotationByIntern(selectedInternId)` — 点击结果后查看轮转

### 视图

- 搜索框（含 300ms 防抖）
- 默认显示「输入姓名或班级搜索实习生（含已归档）」
- 搜索后显示结果表格（班级、性别、实习期、状态）
- 点击「查看轮转」进入时间线视图，按月渲染：
  - 圆形左侧：月序号
  - 月份标题（自然月格式 `YYYY年M月`）
  - 系统徽章（"内" → 靛蓝，"外" → 玫红，简化匹配）
  - 状态徽章（confirmed/completed/pre_alloc → 中文）
  - 科室名 + 起止日期

---

## 8. `Reports.tsx` — 报表导出

### 数据 / 命令

- `useInterns` — 全体实习生（用于状态过滤）
- `useAllCurrentRotation` — 全部轮转记录
- 直接调用 `exportRotationNoticePdf(year, month, operator)` 后端命令

### 4 项导出能力

| 卡片 | 输出 | 范围 |
| --- | --- | --- |
| 实习生名册 | Excel | `status=active/archived/all` 过滤 |
| 轮转计划表 | Excel | 全部轮转（月份 × 实习生矩阵） |
| 科室轮转明细 | Excel | 全部轮转（按轮转月排列） |
| 进修实习通知 | PDF | 按月份导出通知单 |

### 限制

「轮转计划表」和「科室轮转明细」**仅在已确认状态下导出**——若仍为 `pre_alloc`，弹「请先完成正式分配后再导出」提示。

### PDF 详细流程

```typescript
const exportPdf = async () => {
  const loadingToast = toast.loading("正在生成 PDF...");
  try {
    const bytes = await exportRotationNoticePdf(exportYear, exportMonth, operator);
    toast.dismiss(loadingToast);
    const fp = await save({
      defaultPath: `进修实习通知_${year}${month}.pdf`,
      filters: [{ name: "PDF 文件", extensions: ["pdf"] }],
    });
    if (fp) {
      await writeFile(fp, new Uint8Array(bytes));
      toast.success("导出成功！");
    }
  } catch (e) {
    toast.dismiss(loadingToast);
    toast.error("导出失败：" + (e?.message || "未知错误"));
  }
};
```

### 默认参数

自动定位到「下个月」（系统当前是 2026-06 时，则默认 2026-07）：

```typescript
const now = new Date();
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
setExportYear(nextMonth.getFullYear());
setExportMonth(nextMonth.getMonth() + 1);
```

---

## 9. `OperationLogs.tsx` — 操作日志

### 数据

- `useOperationLogs(page, pageSize, actionType)` — 当前页 + 类型过滤
- `useLogCount` — 总数

### 视图

- 顶部标题 + 总数徽章
- 操作类型下拉（13 种 + 「全部类型」）：`create_intern`, `update_intern`, ... → 中文显示用 `getActionTypeLabel`
- 表格列：时间（`formatTimestamp` 显示为 `YYYY-MM-DD HH:MM`）/ 操作人 / 类型徽章 / 详情（截断 max-w-xs）
- 翻页：「上一页 / 当前页 / 下一页」按钮

### 防抖更新

切换 `filter` 自动重置回 `page = 1`：

```typescript
const [page, setPage] = useState(1);
const [filter, setFilter] = useState("");
const pageSize = 30;

onChange={(e) => { setFilter(e.target.value); setPage(1); }}
```

---

## 10. `Settings.tsx` — 系统设置

### 修改密码流程

```typescript
const handleChangePassword = async () => {
  if (newPwd !== confirmPwd) { setMsg("两次密码不一致"); return; }
  if (newPwd.length < 4) { setMsg("密码至少4位"); return; }
  try {
    const ok = await changePassword.mutateAsync({ oldPassword: oldPwd, newPassword: newPwd });
    if (ok) { setMsg("密码修改成功"); /* 清空输入 */ }
    else { setMsg("原密码错误"); }
  } catch { setMsg("修改失败"); }
};
```

页面底部固定显示「老河口市第一医院信息科提供相关技术支持」。

---

## 跨页面共用组件位置

| 用途 | 文件 |
| --- | --- |
| 模态框 | [`components/ui/Modal.tsx`](../../src/components/ui/Modal.tsx) |
| 表单输入 | uniforms 使用 Tailwind 直接控制；调色统一 `border border-slate-200 rounded-lg` |
| 加载指示 | `w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin` |
| 错误提示框 | 红色 50 背景 + 红色边框 + 内嵌 X 图标 |
| 空状态图标 | 内嵌 SVG（48-56px），浅色 stroke |
