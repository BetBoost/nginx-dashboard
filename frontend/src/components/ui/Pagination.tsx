import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const numbers = pageNumbers(page, totalPages);

  return (
    <nav className="flex items-center justify-center gap-1 py-3" aria-label="Pagination">
      <button
        className="btn-ghost p-1.5"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous"
      >
        <ChevronLeft size={16} />
      </button>
      {numbers.map((n, idx) =>
        n === '…' ? (
          <span key={`gap-${idx}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'btn-ghost h-8 min-w-8 px-2 text-sm',
              n === page && 'bg-brand-600 text-white hover:bg-brand-700',
            )}
          >
            {n}
          </button>
        ),
      )}
      <button
        className="btn-ghost p-1.5"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

function pageNumbers(page: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const push = (v: number | '…') => out.push(v);
  const window = 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= page - window && i <= page + window)) {
      push(i);
    } else if (out[out.length - 1] !== '…') {
      push('…');
    }
  }
  return out;
}
