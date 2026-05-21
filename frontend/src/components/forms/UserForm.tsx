import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { createUser, updateUser } from '@/api/queries';
import type { User } from '@/types';

type Mode = 'create' | 'edit' | 'self';

export function UserForm({
  user,
  mode,
  onSuccess,
  allowRoleEdit = true,
}: {
  user?: User;
  mode: Mode;
  onSuccess: (updated?: User) => void;
  allowRoleEdit?: boolean;
}) {
  const isEdit = mode !== 'create';
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<'ADMIN' | 'USER'>(user?.role ?? 'USER');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return createUser({ email, password, name: name || undefined, role });
      }
      const body: Record<string, unknown> = {
        email,
        name: name || undefined,
      };
      if (allowRoleEdit) body.role = role;
      if (mode !== 'self') body.isActive = isActive;
      if (password) body.password = password;
      return updateUser(user!.id, body);
    },
    onSuccess: (res) => {
      toast.success(
        mode === 'create'
          ? 'User created'
          : mode === 'self'
            ? 'Account updated'
            : 'User updated',
      );
      onSuccess(res as User);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-3"
    >
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">
            {mode === 'create' ? 'Temporary password' : 'New password (leave blank to keep)'}
          </label>
          <input
            className="input"
            type={mode === 'create' ? 'text' : 'password'}
            required={mode === 'create'}
            minLength={mode === 'create' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {allowRoleEdit && (
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'USER')}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Account active
        </label>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" size={16} />}
          {isEdit ? 'Save changes' : 'Create user'}
        </button>
      </div>
    </form>
  );
}
