import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'card relative z-10 w-full p-0 max-h-[90vh] flex flex-col',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>
        )}
      </div>
    </div>
  );
}
