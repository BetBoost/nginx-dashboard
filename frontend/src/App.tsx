import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ServersPage } from '@/pages/servers/ServersPage';
import { ServerDetailPage } from '@/pages/servers/ServerDetailPage';
import { ServerSystemPage } from '@/pages/servers/ServerSystemPage';
import { SubdomainsPage } from '@/pages/subdomains/SubdomainsPage';
import { SubdomainDetailPage } from '@/pages/subdomains/SubdomainDetailPage';
import { AuditPage } from '@/pages/audit/AuditPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/servers/:id" element={<ServerDetailPage />} />
          <Route path="/servers/:id/system" element={<ServerSystemPage />} />
          <Route path="/subdomains" element={<SubdomainsPage />} />
          <Route path="/subdomains/:id" element={<SubdomainDetailPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
