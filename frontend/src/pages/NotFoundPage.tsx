import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-slate-500">This page doesn’t exist.</p>
      <Link to="/dashboard" className="btn-primary">
        Back to dashboard
      </Link>
    </div>
  );
}
