import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { queryClient } from "./lib/query/client";
import { Layout } from "./components/layout/Layout";
import { LoginScreen } from "./components/settings/Login";
import { CurrentInternsPage } from "./pages/CurrentInterns";
import { InternDetailPage } from "./pages/InternDetailPage";
import { ArchivedInternsPage } from "./pages/ArchivedInterns";
import { DepartmentMgmtPage } from "./pages/DepartmentMgmt";
import { RotationAllocationPage } from "./pages/RotationAllocation";
import { RotationOverviewPage } from "./pages/RotationOverview";
import { HistorySearchPage } from "./pages/HistorySearch";
import { ReportsPage } from "./pages/Reports";
import { OperationLogsPage } from "./pages/OperationLogs";
import { SettingsPage } from "./pages/Settings";

function AppContent() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CurrentInternsPage />} />
          <Route path="/archived" element={<ArchivedInternsPage />} />
          <Route path="/departments" element={<DepartmentMgmtPage />} />
          <Route path="/interns/:id" element={<InternDetailPage />} />
          <Route path="/rotation" element={<RotationAllocationPage />} />
          <Route path="/interns-overview" element={<RotationOverviewPage />} />
          <Route path="/history" element={<HistorySearchPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/logs" element={<OperationLogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
