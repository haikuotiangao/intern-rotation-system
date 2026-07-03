import { useState, useEffect } from "react";
import { useChangePassword } from "../hooks/useSettings";

const lockIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const infoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

// 从 navigator.userAgent 解出可读的 Windows / Linux 版本号
// Windows 示例: "Windows NT 10.0; ..." → "Windows 10/11"
// Linux 示例(UOS 国产): "UOS; ..." 或 "Linux ..." → "UOS 1050" 等
function parseOS(ua: string): string {
  const u = ua || "";
  // 统信 UOS
  const uosMatch = u.match(/UOS\s*([0-9.]+)/i);
  if (uosMatch) return `统信 UOS ${uosMatch[1]}`;
  // 麒麟 Kylin
  const kylinMatch = u.match(/Kylin[\s/]*([0-9.]+)?/i);
  if (kylinMatch) return `麒麟 Kylin ${kylinMatch[1] || ""}`.trim();
  // Deepin
  const deepinMatch = u.match(/Deepin\s*([0-9.]+)?/i);
  if (deepinMatch) return `Deepin ${deepinMatch[1] || ""}`.trim();
  // Windows NT 10.0 = Win10/11
  const winMatch = u.match(/Windows\s+NT\s+([0-9.]+)/i);
  if (winMatch) {
    const v = winMatch[1];
    if (v === "10.0") return "Windows 10/11";
    if (v === "6.3") return "Windows 8.1";
    if (v === "6.2") return "Windows 8";
    if (v === "6.1") return "Windows 7";
    return `Windows NT ${v}`;
  }
  // macOS
  const macMatch = u.match(/Mac\s+OS\s+X\s+([0-9_]+)/i);
  if (macMatch) return `macOS ${macMatch[1].replace(/_/g, ".")}`;
  // 通用 Linux
  if (/Linux/i.test(u)) {
    const distro = u.match(/\(([^)]*)\)/);
    return `Linux${distro ? " (" + distro[1].split(";").pop()?.trim() + ")" : ""}`;
  }
  return "未知";
}

export function SettingsPage() {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [osInfo, setOsInfo] = useState("检测中...");
  const changePassword = useChangePassword();

  useEffect(() => {
    setOsInfo(parseOS(typeof navigator !== "undefined" ? navigator.userAgent : ""));
  }, []);

  const handleChangePassword = async () => {
    setMsg("");
    if (newPwd !== confirmPwd) { setMsg("两次密码不一致"); setMsgType("error"); return; }
    if (newPwd.length < 4) { setMsg("密码至少4位"); setMsgType("error"); return; }
    try {
      const ok = await changePassword.mutateAsync({ oldPassword: oldPwd, newPassword: newPwd });
      if (ok) {
        setMsg("密码修改成功"); setMsgType("success");
        setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      } else {
        setMsg("原密码错误"); setMsgType("error");
      }
    } catch { setMsg("修改失败"); setMsgType("error"); }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex-shrink-0">系统设置</h2>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          {/* 左列 — 修改密码 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col"
               style={{ minHeight: "80%" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: lockIcon }} />
              <h3 className="font-bold text-slate-800">修改密码</h3>
            </div>
            {msg && (
              <div className={`text-sm p-3 rounded-lg mb-4 flex items-center gap-2 font-medium ${
                msgType === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${msgType === "success" ? "bg-emerald-500" : "bg-red-500" }`} />
                {msg}
              </div>
            )}
            <div className="space-y-3 flex-1">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">原密码</label>
                <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900" />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">新密码</label>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900" />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">确认新密码</label>
                <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900" />
              </div>
            </div>
            <div className="pt-4">
              <button onClick={handleChangePassword}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                dangerouslySetInnerHTML={{ __html: lockIcon.replace('width="20"', 'width="14"').replace('height="20"', 'height="14"') + ' <span>修改密码</span>' }} />
            </div>
          </div>

          {/* 右列 — 关于系统 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col"
               style={{ minHeight: "80%" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: infoIcon }} />
              <h3 className="font-bold text-slate-800">关于系统</h3>
            </div>
            <div className="text-base text-slate-700 space-y-3 pl-1 font-medium flex-1">
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />项目名称: 实习生管理系统</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />软件版本: v1.0.0</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />发布时间: 2026 年 6 月</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />开发架构: Tauri 2 + React + Rust</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />系统环境: <span className="text-slate-800">{osInfo}</span></div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />数据存储: <code className="text-[12px] font-mono text-slate-800 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">%USERPROFILE%\.intern-rotation\data.db</code> (本地)</div>
            </div>
          </div>
        </div>

        {/* 分割线 */}
        <div className="border-t border-slate-200 mt-8" />

        {/* 底部版权 */}
        <p className="text-center text-base font-semibold text-slate-700 mt-6 tracking-wide">
          由老河口市第一医院信息科提供技术支持
        </p>
      </div>
    </div>
  );
}
