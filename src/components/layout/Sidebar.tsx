import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  Archive,
  Building2,
  RefreshCw,
  BarChart3,
  History,
  FileSpreadsheet,
  ClipboardList,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "../../lib/utils";

const iconMap: Record<string, React.ElementType> = {
  "当前实习": Users,
  "归档列表": Archive,
  "科室管理": Building2,
  "轮转分配": RefreshCw,
  "实习总览": BarChart3,
  "信息检索": History,
  "报表导出": FileSpreadsheet,
  "操作日志": ClipboardList,
  "系统设置": Settings,
};

const menuItems = [
  { path: "/", label: "当前实习" },
  { path: "/archived", label: "归档列表" },
  { path: "/departments", label: "科室管理" },
  { path: "/rotation", label: "轮转分配" },
  { path: "/interns-overview", label: "实习总览" },
  { path: "/history", label: "信息检索" },
  { path: "/reports", label: "报表导出" },
  { path: "/logs", label: "操作日志" },
  { path: "/settings", label: "系统设置" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
}

export function Sidebar({ collapsed, onToggle, width }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "h-screen flex flex-col transition-all duration-300 ease-out flex-shrink-0",
        "bg-stone-50",
        "border-r border-stone-200",
      )}
      style={{ width: `${width}px` }}
    >
      <div
        className={cn(
          "flex items-center border-b border-stone-200 min-h-[60px]",
          collapsed ? "justify-center px-2" : "px-4"
        )}
      >
        {!collapsed ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-800 tracking-wide">实习生管理</span>
              <span className="block text-[10px] text-amber-600/60 tracking-wider uppercase font-medium">Intern System</span>
            </div>
          </motion.div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <RefreshCw className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      <nav className="flex flex-col py-1 overflow-y-auto"
      >
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          const Icon = iconMap[item.label];
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center py-3 transition-all duration-200 relative group flex-shrink-0",
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className={cn(
                    "absolute inset-y-0 rounded-xl bg-amber-50",
                    collapsed ? "inset-x-1" : "inset-x-2"
                  )}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={cn(
                  "w-5 h-5 flex-shrink-0 transition-all duration-200 relative z-10",
                  active
                    ? "text-amber-600"
                    : "text-stone-400 group-hover:text-amber-600"
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={cn(
                  "relative z-10 text-base transition-all duration-200 overflow-hidden whitespace-nowrap",
                  collapsed ? "w-0 opacity-0" : "opacity-100",
                  active
                    ? "text-stone-900 font-bold"
                    : "text-stone-700 font-semibold group-hover:text-stone-900"
                )}
              >
                {item.label}
              </span>
              {active && !collapsed && (
                <span className="relative z-10 w-1 h-5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50 flex-shrink-0 ml-auto" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-stone-200 px-3 py-2 flex items-center gap-2">
        <span className="text-[10px] text-stone-400 tracking-wide font-medium flex-shrink-0">
          v1.0
        </span>
        <button
          onClick={onToggle}
          aria-label="Toggle sidebar"
          className="ml-auto p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200 flex items-center justify-center"
        >
          {collapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
