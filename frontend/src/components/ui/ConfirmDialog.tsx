import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Modal } from './Modal';

export type ConfirmTone = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** If provided, the user must type this exact value before confirm enables. */
  typeToConfirm?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  pending?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
}

/**
 * Generic confirmation modal. Replaces `window.confirm` so it works inside
 * stacking contexts, looks consistent with the rest of the UI, and lets us
 * gate destructive actions behind a "type the name" check.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  typeToConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  // Reset the typed value whenever the dialog (re)opens so a previous value
  // can't accidentally pre-enable confirm.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const matches = !typeToConfirm || typed.trim() === typeToConfirm;
  const disabled = pending || !matches;

  const btnClass =
    tone === 'danger'
      ? 'btn-danger'
      : tone === 'warning'
        ? 'btn-secondary text-amber-700 dark:text-amber-300'
        : 'btn-primary';

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && <AlertTriangle size={18} className="text-red-500" />}
          {title}
        </span>
      }
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            className={btnClass}
            onClick={() => {
              if (disabled) return;
              void onConfirm();
            }}
            disabled={disabled}
            data-testid="confirm-dialog-confirm"
          >
            {pending && <Loader2 className="animate-spin" size={14} />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {description && <div className="text-slate-600 dark:text-slate-300">{description}</div>}
        {typeToConfirm && (
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Type <span className="font-mono">{typeToConfirm}</span> to confirm
            </label>
            <input
              className="input font-mono"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !disabled) void onConfirm();
              }}
              placeholder={typeToConfirm}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
