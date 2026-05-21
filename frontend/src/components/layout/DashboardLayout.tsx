import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Server,
  Settings,
  Sun,
  X,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { logout } from '@/api/queries';

const nav = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/servers',    label: 'Servers',    icon: Server },
  { to: '/subdomains', label: 'Subdomains', icon: Globe },
  { to: '/audit',      label: 'Audit log',  icon: History },
  { to: '/settings',   label: 'Settings',   icon: Settings },
];

export function DashboardLayout() {
  const { user, clear } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white',
          'dark:border-slate-800 dark:bg-surface-dark',
          'fixed inset-y-0 left-0 z-40 transition-transform md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white">
              <Activity className="m-1.5" size={20} />
            </div>
            <span className="font-semibold">Nginx Dashboard</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="btn-ghost p-1 md:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <item.icon size={18} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
              {(user?.name ?? user?.email ?? '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-sm font-medium">{user?.name ?? user?.email}</div>
              <div className="truncate text-xs text-slate-500">{user?.role}</div>
            </div>
            <button onClick={handleLogout} className="btn-ghost p-1" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-surface-dark">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-ghost p-1.5 md:hidden"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <button onClick={toggle} className="btn-ghost p-1.5" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
