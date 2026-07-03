# 05 · React 前端

> React + TypeScript 前端的模块划分、状态管理、UI 规范。

## 1. 应用启动

```typescript
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## 2. 顶层组件

```typescript
// src/App.tsx
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

function AppContent() {
  const [loggedIn, setLoggedIn] = useState(false);
  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CurrentInternsPage />} />
          {/* ... 共 10 个路由 ... */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**特点：**
- 单用户登录守卫（`useState<boolean>` 而非 cookie/localStorage）
- 登录后路由进入 `Layout`（含侧边栏 + 顶栏 + Outlet）

## 3. 状态管理

**全依赖 TanStack Query，无 Redux / Zustand**。配置见 [`src/lib/query/client.ts`](../../src/lib/query/client.ts)：

```typescript
new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
```

### 3.1 Hook 统一范式

```typescript
// query
export function useXxxQuery() {
  return useQuery({
    queryKey: ['xxx'],
    queryFn: () => api.xxx(),
  });
}

// mutation
export function useXxxMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.xxx(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xxx'] }),
  });
}
```

完整索引：[frontend/hooks-reference.md](./frontend/hooks-reference.md)。

### 3.2 关键 key 列表

| Query Key | 来源 hook | 失效时机 |
| --- | --- | --- |
| `['interns', status]` | `useInterns(status)` | 创建 / 修改 / 删除 / 导入 / 归档 / 撤销归档 |
| `['intern', id]` | `useIntern(id)` | 单条修改后 |
| `['interns', 'archived']` | `useArchivedInterns` | 归档 / 撤销 |
| `['departments']` | `useDepartments` | 增改删科室 |
| `['department-systems']` | `useDepartmentSystems` | 增改删系统 |
| `['total-capacity']` | `useTotalCapacity` | 增改删科室后 |
| `['rotation-current']` | `useAllCurrentRotation` | 预分配 / 调整 / 确认 / 重置 |
| `['rotation-intern', id]` | `useRotationByIntern` | 该实习生调整后 |
| `['rotation-month', i]` | `useRotationByMonth` | 同上 |
| `['operation-logs', ...]` | `useOperationLogs` | 仅手动刷新 |
| `['log-count']` | `useLogCount` | 同上 |

## 4. 样式规范

### 4.1 主题色与排版

[`src/index.css`](../../src/index.css) 中定义：

```css
:root {
  --background: 40 20% 96%;       /* 暖白 */
  --foreground: 220 15% 16%;      /* 深石板 */
  --primary: 42 55% 45%;          /* 琥珀金 */
  --accent: 36 70% 45%;           /* 杂草红金 */
  --radius: 0.5rem;
}

/* 全局字体 */
body {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 15px;
  background-color: #f8f6f3;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Noto Serif SC', serif;
  font-weight: 800;
}
```

### 4.2 系统配色表（用于轮转甘特图）

[`src/lib/utils.ts`](../../src/lib/utils.ts) 中的 `systemColors` 与 `getSystemColor(name)`：

```typescript
const colorPalette = [
  { name: 'slate' }, { name: 'gray' }, { name: 'red' },
  { name: 'orange' }, { name: 'amber' }, { name: 'emerald' },
  { name: 'cyan' }, { name: 'blue' }, { name: 'indigo' },
  { name: 'violet' }, { name: 'pink' }, ...
];

export function getSystemColor(systemName: string) {
  let hash = 0;
  for (let i = 0; i < systemName.length; i++) {
    hash = (hash * 37 + systemName.charCodeAt(i) * (i + 1)) | 0;
  }
  return systemColors[Math.abs(hash) % systemColors.length];
}
```

**特性**：相同系统名 → 相同颜色（用户视觉一致）；不同系统名尽量分散。

### 4.3 工具函数 [`src/lib/utils.ts`](../../src/lib/utils.ts)

```typescript
cn(...inputs)                                      // Tailwind class 合并
getEndDate(intern) -> 'YYYY-MM-DD'                  // 计算实习终日
formatDate(str) -> 'YYYY-MM-DD'
formatTimestamp(seconds) -> 'YYYY-MM-DD HH:MM'
getSystemColor(name) -> { bg, text, bar }
getActionTypeLabel(type) -> 中文标签
```

## 5. 通用组件

### 5.1 [`components/layout/Layout.tsx`](../../src/components/layout/Layout.tsx) — 主框架

```text
┌──────────────────────────────────────────────────────┐
│ Sidebar │  Header (breadcrumb + 系统运行中)         │
│         ├──────────────────────────────────────────┤
│         │                                          │
│  菜单   │  Outlet (页面)                           │
│         │                                          │
└──────────────────────────────────────────────────────┘
```

- 侧边栏可折叠（`collapsed` 由 Layout 内 state 控制）
- 顶栏右侧脉动绿点 + "系统运行中"
- `<motion.main key={location.pathname} ...>` 切换页面触发进入动画

### 5.2 [`components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx) — 侧边栏

- 9 项菜单（lucide-react 图标）
- 当前项用 `motion.div layoutId="sidebar-active"` 在多菜单间平滑移动
- 顶部 logo (琥珀金背景)
- 顶部 → 菜单 → 底部（版本号 + 折叠开关）

### 5.3 [`components/ui/Modal.tsx`](../../src/components/ui/Modal.tsx) — 通用模态框

- Framer Motion 淡入 + 缩放进入
- ESC 关闭
- 点击遮罩关闭
- size: `sm/md/lg/xl`
- 标题栏可关闭

### 5.4 [`components/interns/InternForm.tsx`](../../src/components/interns/InternForm.tsx) — 实习生表单

字段：班级、姓名、性别、本人电话、家长电话、毕业学校、开始日期、结束日期、轮转类型（轮转/固定）、固定科室（仅在 isFixed 时显示）、实习天数、备注。

特殊交互：
- 改开始日期自动重算结束日期（保持天数不变）
- 改结束日期自动重算月数 `Math.round(days / 30)`
- 切轮转/固定自动清空 `fixed_department_id`

### 5.5 [`components/interns/InternImport.tsx`](../../src/components/interns/InternImport.tsx) — Excel 导入

- 用 `xlsx` 读 `.xlsx` / `.xls`
- 必须列：姓名（其他列可选，缺失给空字符串）
- 自动用 `班级 / 姓名 / class / name` 等多语言列名尝试匹配
- 「固定科室」列按系统表中的「非轮转系统」科室名称映射成 ID（name → id）
- 缺开始日期 → 今日；缺结束日期 → 今日 + 180 天
- 显示预览表，确认后批量入库

### 5.6 [`components/settings/Login.tsx`](../../src/components/settings/Login.tsx) — 登录

- 通过 `useCheckPassword` 判断：
  - 若 settings 表无 `password_hash` → 「首次使用」模式，设置密码
  - 否则 → 密码输入模式，调用 `verifyLogin`
- 通过 → 触发 `onLogin()` 切到 Layout
- 设置失败显示 toast

## 6. 类型对齐

所有 TypeScript 类型位于 [`src/types.ts`](../../src/types.ts)，与 Rust struct 一一对应：

```typescript
// 与 database::dao::interns::Intern 对应
export interface Intern {
  id: string;
  class_name: string;
  name: string;
  // ...
  fixed_department_id?: string;
}

// 与 DatabaseWithSystem 对应
export interface DepartmentWithSystem {
  id: string;
  name: string;
  system_id: string;
  system_name: string;
  capacity: number;
  is_active: boolean;
}

// 与 RotationWithNames 对应
export interface RotationWithNames {
  id: string;
  intern_id: string;
  intern_name: string;
  intern_school?: string;
  department_id: string;
  department_name: string;
  system_name: string;
  month_index: number;
  start_date?: string;
  end_date?: string;
  status: string;
}

export interface OperationLog {
  id: string;
  operator: string;
  action_type: string;
  action_detail: string;
  created_at: number;
}
```

> Tauri IPC 跨语言序列化使用 camelCase ↔ snake_case 自动转换，所以前端属性保持 snake_case。

## 7. 路由与页面

详见 [06-frontend-pages.md](./06-frontend-pages.md)。

完整 api 索引：[frontend/api-reference.md](./frontend/api-reference.md)。

## 8. 典型交互模式

### 8.1 防抖搜索（实习生页）

```typescript
const [search, setSearch] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");
const searchTimer = useRef<ReturnType<typeof setTimeout>>();

useEffect(() => {
  clearTimeout(searchTimer.current);
  searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
  return () => clearTimeout(searchTimer.current);
}, [search]);

const { data: interns } = useInterns(debouncedSearch ? undefined : "active");
const searchMutation = useSearchInterns();
useEffect(() => {
  if (!debouncedSearch) { setSearchResults(null); return; }
  searchMutation.mutate({ keyword: debouncedSearch, status: "active" }, {
    onSuccess: (data) => setSearchResults(data),
  });
}, [debouncedSearch]);
```

### 8.2 Excel 导出（保存对话框 + 写文件）

```typescript
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "实习生名单");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const fp = await save({
  defaultPath: `实习生名单_${new Date().toISOString().slice(0, 10)}.xlsx`,
  filters: [{ name: "Excel 文件", extensions: ["xlsx"] }],
});
if (fp) {
  await writeFile(fp, new Uint8Array(buf));
}
```

### 8.3 Toast 反馈

```typescript
import toast from "react-hot-toast";
toast.success("导出成功！");
toast.error("保存失败：" + e.message);
const id = toast.loading("正在生成 PDF...");
// ... 完成
toast.dismiss(id);
```

### 8.4 操作失败二次确认

```typescript
if (confirm("确定删除该科室？")) deleteDept.mutate({ id, operator });
if (confirm("确认分配后方案将被锁定，确定继续？")) confirmAlloc.mutate(...);
```

## 9. 主题色与图标

- **图标**：lucide-react，每个图标用 `className` 应用大小与颜色
- **图标集**：Users / Archive / Building2 / RefreshCw / BarChart3 / History / FileSpreadsheet / ClipboardList / Settings / PanelLeftClose
- 自定义 inline SVG：通过 `dangerouslySetInnerHTML={{ __html: "<svg>...</svg>" }}` 注入（已通过 CSP 设置允许）

## 10. UI 类设计模式

- **卡片式列表**：实习生卡片、报告卡片、操作按钮统一在白底卡片中，hover 抬起 + 阴影
- **表格**：固定 thead + 横向 scroll + 表格行 hover 高亮染底色
- **空状态**：svg + 单行提示文案
- **加载状态**：`w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin`
- **提示条**：成功绿色 / 警告琥珀 / 错误红色 + 居中图标

## 11. 性能与优化

- React Query 的 `staleTime: 30s` 减少重复请求
- 防抖搜索减少 search_interns 命令调用频次
- 轮转甘特图反复使用 `useMemo` 缓存派生量（`internRotationMap`, `allMonthKeys` 等）
- `framer-motion` 的 `whileHover` 通过 `transform` 而非 reflow，渲染开销极低

## 12. 可维护性建议

1. 改 `types.ts` 时同时改后端 struct（字段顺序不影响，只要类型兼容）
2. 增删 hook 后务必更新 [frontend/hooks-reference.md](./frontend/hooks-reference.md)
3. 任何导出功能记得含错误捕获 + `toast` 反馈
4. 所有 hook mutation 都要 `invalidateQueries` 让 React Query 重新拉取
