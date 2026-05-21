import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { createServer, updateServer } from '@/api/queries';
import type { Server } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  host: z.string().min(1, 'Host required'),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  authMethod: z.enum(['key', 'password']),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
  password: z.string().optional(),
  certbotEnabled: z.boolean().default(true),
  notes: z.string().optional(),
});
type FormValues = z.input<typeof schema>;

export function ServerForm({
  server,
  onSuccess,
}: {
  server?: Server;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(server);
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>(
    server?.authMethod ?? 'key',
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: server?.name ?? '',
      host: server?.host ?? '',
      port: server?.port ?? 22,
      username: server?.username ?? '',
      authMethod: server?.authMethod ?? 'key',
      certbotEnabled: server?.certbotEnabled ?? true,
      notes: server?.notes ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body: Record<string, unknown> = {
        name: values.name,
        host: values.host,
        port: Number(values.port),
        username: values.username,
        certbotEnabled: values.certbotEnabled,
        notes: values.notes,
      };
      if (authMethod === 'key') {
        if (values.privateKey) body.privateKey = values.privateKey;
        if (values.passphrase !== undefined) body.passphrase = values.passphrase;
      } else {
        if (values.password) body.password = values.password;
      }
      return server ? updateServer(server.id, body) : createServer(body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Server updated' : 'Server added');
      onSuccess();
    },
  });

  const onSubmit = handleSubmit((v) => {
    if (!isEdit) {
      if (authMethod === 'key' && !v.privateKey) {
        setError('privateKey', { message: 'Private key required' });
        return;
      }
      if (authMethod === 'password' && !v.password) {
        setError('password', { message: 'Password required' });
        return;
      }
    }
    mutation.mutate({ ...v, authMethod });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message}>
          <input className="input" {...register('name')} placeholder="edge-eu-01" />
        </Field>
        <Field label="Username" error={errors.username?.message}>
          <input className="input" {...register('username')} placeholder="deploy" />
        </Field>
        <Field label="Host" error={errors.host?.message}>
          <input className="input" {...register('host')} placeholder="edge1.example.com" />
        </Field>
        <Field label="SSH port" error={errors.port?.message}>
          <input className="input" type="number" {...register('port')} />
        </Field>
      </div>

      <div>
        <label className="label">Authentication method</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="authMethod"
              value="key"
              checked={authMethod === 'key'}
              onChange={() => setAuthMethod('key')}
            />
            SSH private key
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="authMethod"
              value="password"
              checked={authMethod === 'password'}
              onChange={() => setAuthMethod('password')}
            />
            Password
          </label>
        </div>
      </div>

      {authMethod === 'key' ? (
        <>
          <Field
            label={
              isEdit
                ? 'Private key (OpenSSH PEM) — leave blank to keep existing'
                : 'Private key (OpenSSH PEM)'
            }
            error={errors.privateKey?.message}
          >
            <textarea
              className="input min-h-[160px] font-mono text-xs"
              {...register('privateKey')}
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'}
            />
          </Field>
          <Field label="Passphrase (optional)">
            <input type="password" className="input" {...register('passphrase')} />
          </Field>
        </>
      ) : (
        <Field
          label={isEdit ? 'Password — leave blank to keep existing' : 'Password'}
          error={errors.password?.message}
        >
          <input type="password" className="input" {...register('password')} />
        </Field>
      )}

      <Field label="Enable certbot">
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('certbotEnabled')} />
          Automatically issue/renew Let's Encrypt certs
        </label>
      </Field>

      <Field label="Notes">
        <textarea className="input" rows={2} {...register('notes')} />
      </Field>

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn-primary" disabled={isSubmitting || mutation.isPending}>
          {(isSubmitting || mutation.isPending) && <Loader2 className="animate-spin" size={16} />}
          {isEdit ? 'Save changes' : 'Add server'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
