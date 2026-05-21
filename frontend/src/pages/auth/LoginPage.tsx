import { FormEvent, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Activity, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { login } from '@/api/queries';
import { useAuthStore } from '@/stores/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAccessToken, setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      setAccessToken(res.accessToken);
      setUser(res.user);
      const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      toast.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center bg-slate-50 px-4 py-10 dark:bg-surface-dark">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
            <Activity size={20} />
          </div>
          <span className="text-base font-semibold">Nginx Dashboard</span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          Welcome back — sign in to manage your subdomains.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 className="animate-spin" size={16} />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
