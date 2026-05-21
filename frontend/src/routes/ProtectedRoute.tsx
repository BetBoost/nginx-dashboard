import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth.store';
import { me } from '@/api/queries';

/**
 * Wraps the authenticated portion of the app:
 *  - if no access token in memory, try a silent refresh
 *  - if /auth/me fails, push the user to /login
 */
export function ProtectedRoute() {
  const location = useLocation();
  const { user, accessToken, setUser, clear } = useAuthStore();
  const [checking, setChecking] = useState(!user);

  useEffect(() => {
    if (user) {
      setChecking(false);
      return;
    }
    me()
      .then((u) => setUser(u))
      .catch(() => clear())
      .finally(() => setChecking(false));
  }, [user, accessToken, setUser, clear]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
