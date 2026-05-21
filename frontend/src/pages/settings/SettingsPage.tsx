import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { UserForm } from '@/components/forms/UserForm';
import { deleteUser, listUsers, me as fetchMe } from '@/api/queries';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types';

export function SettingsPage() {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [openSelfEdit, setOpenSelfEdit] = useState(false);

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers({ pageSize: 100 }),
    enabled: me?.role === 'ADMIN',
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const refreshMe = async () => {
    const fresh = await fetchMe();
    setUser({ id: fresh.id, email: fresh.email, name: fresh.name, role: fresh.role });
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and team members." />

      <Card className="mb-4">
        <div className="flex items-start justify-between">
          <CardHeader title="Your account" />
          <button className="btn-secondary" onClick={() => setOpenSelfEdit(true)}>
            <Pencil size={14} /> Edit
          </button>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <Field label="Email">{me?.email}</Field>
          <Field label="Role"><Badge tone="blue">{me?.role}</Badge></Field>
          <Field label="Name">{me?.name ?? '—'}</Field>
        </div>
      </Card>

      {me?.role === 'ADMIN' && (
        <Card className="p-0">
          <div className="flex items-center justify-between p-5">
            <CardHeader title="Team" subtitle={`${data?.total ?? 0} users`} />
            <button className="btn-primary" onClick={() => setOpenCreate(true)}>
              <Plus size={16} /> Invite user
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data?.items?.map((u) => (
                  <tr key={u.id} className="table-row-hover">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">{u.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === 'ADMIN' ? 'violet' : 'gray'}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? <Badge tone="green">yes</Badge> : <Badge tone="red">no</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="btn-ghost p-1"
                          title="Edit"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn-ghost p-1 text-red-500"
                          title="Delete"
                          disabled={u.id === me?.id}
                          onClick={() => setDeleting(u)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={openCreate} onClose={() => setOpenCreate(false)} title="Invite user" size="md">
        <UserForm
          mode="create"
          onSuccess={() => {
            setOpenCreate(false);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.email}` : 'Edit user'}
        size="md"
      >
        {editing && (
          <UserForm
            mode="edit"
            user={editing}
            onSuccess={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['users'] });
            }}
          />
        )}
      </Modal>

      <Modal
        open={openSelfEdit}
        onClose={() => setOpenSelfEdit(false)}
        title="Edit your account"
        size="md"
      >
        {me && (
          <UserForm
            mode="self"
            allowRoleEdit={false}
            user={{
              id: me.id,
              email: me.email,
              name: me.name ?? null,
              role: me.role,
              isActive: true,
              createdAt: '',
              updatedAt: '',
            }}
            onSuccess={async () => {
              setOpenSelfEdit(false);
              await refreshMe();
              qc.invalidateQueries({ queryKey: ['users'] });
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => (delMutation.isPending ? undefined : setDeleting(null))}
        title="Delete user?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setDeleting(null)}
              disabled={delMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700"
              onClick={() => deleting && delMutation.mutate(deleting.id)}
              disabled={delMutation.isPending}
            >
              Delete
            </button>
          </div>
        }
      >
        {deleting && (
          <p className="text-sm">
            Permanently delete <span className="font-medium">{deleting.email}</span>?
          </p>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
