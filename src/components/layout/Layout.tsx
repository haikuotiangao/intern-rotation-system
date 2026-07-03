import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { useAutoArchive } from "../../hooks/useArchive";
import { cn } from "../../lib/utils";
import { Toaster } from "react-hot-toast";

const pageTitles: Record<string, string> = {
  "/": "当前实习",
  "/archived": "归档列表",
  "/departments": "科室管理",
  "/rotation": "轮转分配",
  "/interns-overview": "实习总览",
  "/history": "信息检索",
  "/reports": "报表导出",
  "/logs": "操作日志",
  "/settings": "系统设置",
};

const APP_VERSION = "1.0.0";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 240;

function loadSidebarWidth(): number {
  try {
    const stored = localStorage.getItem("sidebarWidth");
    if (stored) {
      const n = parseInt(stored, 10);
      if (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n;
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT;
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const autoArchive = useAutoArchive();
  const [routeProgress, setRouteProgress] = useState(0);
  const prevPathRef = useRef<string>(location.pathname);
  const progressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    autoArchive.mutate();
  }, []);

  // 路由切换时:头部进度条快速跳到 ~80%,并在 380ms 内走完到 100%。
  // 同一路由刷新不触发(r14:一致体验)
  useEffect(() => {
    if (prevPathRef.current === location.pathname) return;
    prevPathRef.current = location.pathname;

    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setRouteProgress(15);
    const t1 = window.setTimeout(() => setRouteProgress(70), 80);
    const t2 = window.setTimeout(() => setRouteProgress(100), 260);
    const t3 = window.setTimeout(() => setRouteProgress(0), 600);
    progressTimerRef.current = t3;
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [location.pathname]);

  // ---- 拖拽调整侧栏宽度 ----
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  // 拖拽结束时保存到 localStorage
  useEffect(() => {
    if (!dragging) {
      try {
        localStorage.setItem("sidebarWidth", String(sidebarWidth));
      } catch {
        // ignore
      }
    }
  }, [dragging, sidebarWidth]);

  const title = pageTitles[location.pathname] || "实习生管理系统";

  // 折叠时侧栏宽度为 64px,否则为拖拽后的宽度
  const actualSidebarWidth = collapsed ? 64 : sidebarWidth;

  return (
    <div
      className={cn("flex h-screen bg-stone-50", dragging && "select-none")}
      style={dragging ? { userSelect: "none" } as React.CSSProperties : undefined}
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        width={actualSidebarWidth}
      />
      {/* 拖拽分隔条 — 仅在非折叠状态下显示 */}
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className={cn(
            "flex-shrink-0 transition-colors duration-150",
            dragging
              ? "bg-blue-500 cursor-col-resize"
              : "bg-stone-200 hover:bg-blue-400 cursor-col-resize"
          )}
          style={{ width: 6 }}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部进度条 — 路由切换时显示,与 framer-motion main key 动画配套 */}
        <div className="relative h-[2px] w-full bg-slate-100/60 overflow-hidden flex-shrink-0">
          <AnimatePresence>
            {routeProgress > 0 && (
              <motion.div
                key="route-progress"
                initial={{ width: 0, opacity: 1 }}
                animate={{ width: `${routeProgress}%`, opacity: routeProgress >= 100 ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: routeProgress === 100 ? 0.18 : 0.25, ease: "easeOut" }}
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-500 via-emerald-500 to-amber-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]"
              />
            )}
          </AnimatePresence>
        </div>
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full bg-gradient-to-b from-amber-500 to-yellow-600" />
            <h1 className="text-lg font-extrabold text-slate-800 tracking-wide">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-600/70 font-medium">系统运行中</span>
          </div>
        </header>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn("flex-1 overflow-auto", "bg-noise")}
        >
          <div className="p-6 h-full">
            <Outlet />
          </div>
        </motion.main>
      </div>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: "#0f172a",
            color: "#f1f5f9",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "14px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          },
          success: { iconTheme: { primary: "#10b981", secondary: "#ffffff" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#ffffff" } },
        }}
        containerStyle={{ top: 80 }}
      />
    </div>
  );
}
