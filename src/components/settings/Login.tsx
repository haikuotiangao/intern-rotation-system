import { useState } from "react";
import { useCheckPassword, useVerifyLogin, useSetupPassword } from "../../hooks/useSettings";

interface LoginProps { onLogin: () => void; }

const lockIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const logoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';

export function LoginScreen({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSetup, setIsSetup] = useState(false);

  const { data: hasPassword, isLoading } = useCheckPassword();
  const verifyLogin = useVerifyLogin();
  const setupPassword = useSetupPassword();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-800 to-indigo-900">
        <div className="animate-spin w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleFirstSetup = async () => {
    if (newPassword !== confirmPassword) { setError("两次输入的密码不一致"); return; }
    if (newPassword.length < 4) { setError("密码至少4位"); return; }
    try { await setupPassword.mutateAsync(newPassword); onLogin(); }
    catch { setError("设置密码失败"); }
  };

  const handleLogin = async () => {
    setError("");
    try {
      const ok = await verifyLogin.mutateAsync(password);
      if (ok) onLogin();
      else setError("密码错误");
    } catch { setError("登录失败"); }
  };

  const containerClass = "flex items-center justify-center h-screen bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900";

  if (!hasPassword) {
    return (
      <div className={containerClass}>
        <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-96 border border-white/20 animate-fadeIn">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-indigo-600/30"
              dangerouslySetInnerHTML={{ __html: lockIcon.replace('width="20"', 'width="28"').replace('height="20"', 'height="28"') }} />
            <h2 className="text-xl font-bold text-slate-800">首次使用</h2>
            <p className="text-sm text-slate-500 mt-1">设置管理员密码</p>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
          <input type="password" placeholder="设置密码" value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 mb-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
          <input type="password" placeholder="确认密码" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 mb-5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
          <button onClick={handleFirstSetup}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
            设置密码并进入系统
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-96 border border-white/20 animate-fadeIn">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-indigo-600/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">实习生管理系统</h2>
          <p className="text-sm text-slate-500 mt-1">请输入管理员密码</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        <input type="password" placeholder="管理员密码" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 mb-5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          autoFocus />
        <button onClick={handleLogin}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-600/20">
          进入系统
        </button>
      </div>
    </div>
  );
}
