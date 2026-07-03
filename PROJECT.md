# 实习生管理系统 (Intern Rotation System)

## Overview
A Tauri v2 + React + TypeScript + Tailwind desktop app for managing hospital intern rotations. Built with Rust (Tauri backend + SQLite) and React frontend.

## Architecture
- **Backend**: Rust/Tauri with SQLite via rusqlite
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Build**: `npm run tauri build` → NSIS installer → `output/实习生管理系统_1.0.0_x64-setup.exe`

## Current State (as of 2026-06-04)
All 7 requirements + 5 bug fixes implemented and packaged.

### Bug Fixes (Session 2)
1. **Header text** - Fixed "实习生轮转管理" → "实习生管理" in tauri.conf.json (window title) and Cargo.toml (description)
2. **Natural months** - RotationAllocation, HistorySearch, Reports now show calendar months (e.g. "2026年7月") instead of "第1月"/"第X个月"
3. **Late-start allocation** - Fixed `fixed_interns` and `rotation_interns` filters in rotation_service.rs to properly handle empty-string vs None fixed_department_id; allocation correctly skips months before intern's personal start
4. **Nav buttons** - RotationOverview left/right nav replaced `opacity-0 pointer-events-none` with `invisible` + `disabled` attribute for robust click handling
5. **Fixed dept display** - CurrentInterns cards now show "轮转" or "固定: 科室名" badge; rotation_service.rs filter logic cleaned up

### Bug Fixes (Session 3)
1. **Rotation modal dates** - Assignment start/end dates now clamp to intern's actual start/end dates (first month shows actual start_date, last month shows actual end_date)
2. **Rotation start date** - `rotation_start` now based on earliest intern's start month (e.g., June), so 张2 starts from month 0 instead of being pushed to next month
3. **Color indicators** - CurrentInterns cards now have distinct borders (emerald for fixed, indigo for rotating) + colored dots before names + colored status labels
4. **Click intern → detail view** - No longer navigates to rotation-overview; opens a detail modal showing full intern info + rotation timeline (sorted by month, with status badges)

## Key Features
1. **Department Systems** - Group departments into systems (e.g. "内科系统", "外科系统"), each with `is_rotation` toggle and `rotation_interval` (how many consecutive months before switching systems)
2. **Non-rotation departments** - Systems with `is_rotation=false` auto-assign interns as fixed; InternForm/Import has "轮转类型" toggle
3. **Rotation allocation** - Hamilton (largest-remainder) proportional allocation per month; alternates between 2 rotation systems per `rotation_interval`
4. **Late-start handling** - `intern_personal_start` = max(rotation_start, month-after-start-date-1st); allocation filter `m >= offset && m < offset + total` skips past months
5. **RotationOverview gantt** - Left sidebar (searchable intern list) + right gantt/timeline with calendar month headers, left/right navigation (hidden when ≤6 months), past months locked with gray overlay
6. **Auto-archive** - On CurrentInterns page mount + refresh button
7. **Multi-system support** - Can define N systems; only first 2 with `is_rotation=true` are used for rotation alternation

## File Map

### Rust Backend (`src-tauri/src/`)
| File | Purpose |
|------|---------|
| `database/schema.rs` | CREATE TABLE + ALTER TABLE SQL; schema migration |
| `database/dao/rotation.rs` | RotationAssignment DAO (insert, delete, query with names) |
| `database/dao/interns.rs` | Intern DAO (CRUD, find by status, search) |
| `database/dao/departments.rs` | DepartmentSystem + DepartmentWithSystem structs; DAO with all SQL |
| `database/dao/logs.rs` | OperationLog DAO |
| `services/rotation_service.rs` | Core allocation logic: pre_allocate, proportional_assign, intern_personal_start, start_offset, rotation_months |
| `services/department_service.rs` | Department + System CRUD commands |
| `services/intern_service.rs` | Intern CRUD, archive/auto-archive logic |
| `commands/mod.rs` + `commands/department_commands.rs` | Tauri command registrations |
| `lib.rs` | All commands registered here |
| `state.rs` | Tauri managed state (DB connection) |
| `error.rs` | AppError type |

### React Frontend (`src/`)
| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript interfaces (Intern, DepartmentSystem, DepartmentWithSystem, RotationAssignmentWithNames, etc.) |
| `lib/api/interns.ts` | Intern API calls (useReadApi) |
| `lib/api/departments.ts` | Department + System API calls (createSystem/updateSystem/deleteSystem) |
| `lib/api/rotation.ts` | Rotation allocation API |
| `hooks/useInterns.ts` | Intern query/mutation hooks |
| `hooks/useDepartments.ts` | Department + System query/mutation hooks |
| `hooks/useRotation.ts` | Rotation allocation hooks |
| `pages/DepartmentMgmt.tsx` | System + Department CRUD; dynamic system cards with cycling color palette |
| `pages/RotationOverview.tsx` | Gantt timeline; calendar month headers; nav buttons; lock logic for past months |
| `pages/CurrentInterns.tsx` | Intern list with auto-archive on mount + refresh button |
| `components/interns/InternForm.tsx` | Add/Edit intern; rotation type toggle + fixed dept dropdown |
| `components/interns/InternImport.tsx` | Excel import; parses "固定科室" column |
| `components/settings/Login.tsx` | Login page |
| `pages/Settings.tsx` | Settings page |

### Key Data Structures (types.ts)
```typescript
DepartmentSystem: { id, name, sort_order, is_rotation: boolean, rotation_interval: number }
DepartmentWithSystem: { id, name, capacity, system_id, system_name, is_rotation, rotation_interval }
Intern: { ..., fixed_department_id: string | null, ... }
RotationAssignmentWithNames: { id, intern_id, intern_name, department_id, department_name, month_index, start_date, end_date, status }
```

## Rotation Algorithm (`rotation_service.rs`)
1. Collect all active interns; filter out expired (end_date > today)
2. Determine `rotation_start` = next month 1st (or today if today is 1st)
3. Delete all existing `pre_alloc` records
4. Fixed-department interns → assign to their fixed department for all their months (offset + total_months)
5. Rotating interns → split into 2 groups (shuffled), each group alternates between sys1/sys2 per `cycle_len = interval1 + interval2`
6. Within each system, Hamilton proportional allocation per month
7. Late-start filtering: `m >= intern_start_offset && m < offset + intern_rotation_months`

## Key Decisions
- Month index in DB = `(m + 1)` where m is 0-based from rotation_start
- `intern_personal_start` = `max(rotation_start, month-after-start_date-1st)` to skip past months for late arrivers
- `intern_start_offset` = months from rotation_start to personal_start (0 if personal_start <= rotation_start)
- `intern_rotation_months` = months from effective_start to end_date
- Navigation buttons hidden (not just disabled) when all months ≤ 6 fit in viewport
- Past months locked: `monthIndex <= currentMonthOffset` (current month = months since rotation_start)
- Single-intern timeline: calendar month labels (e.g. "7月"), not sequence numbers
- Colors for system cards cycle through a hardcoded palette

## Build Commands
```bash
npm run tauri build          # Full release build → NSIS installer
cargo check                  # Rust compilation check
npx tsc --noEmit             # TypeScript type check
npm run dev                  # Dev mode
```

## Installer Output
`output/实习生管理系统_1.0.0_x64-setup.exe`

## Dev Notes for Future Agents
- Always run `cargo check` and `npx tsc --noEmit` after changes
- SQLite schema changes need both CREATE TABLE + ALTER TABLE in schema.rs
- DepartmentSystem has 5 columns: id, name, sort_order, is_rotation, rotation_interval
- System deletion blocked when child departments exist (Rust-side check)
- Calendar months in RotationOverview use `monthKey(date)` pattern: "YYYY-MM"
- The `fixed_department_id` on Intern is cleared when rotation type = "轮转"
- Auto-archive: `/api/interns/auto-archive` deletes expired interns (end_date < today)
- Pre-alloc status = "pre_alloc"; when archived, interns are deleted from DB
