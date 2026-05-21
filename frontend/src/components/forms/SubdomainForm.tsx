import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { createSubdomain, listServers, updateSubdomain } from '@/api/queries';
import type { Subdomain } from '@/types';

const baseSchema = z.object({
  upstreamScheme: z.enum(['http', 'https']).default('http'),
  upstreamHost: z.string().min(1),
  upstreamPort: z.coerce.number().int().min(1).max(65535).default(80),
  forceHttps: z.boolean().default(true),
  websocket: z.boolean().default(false),
  clientMaxBodySize: z.string().optional(),
  customDirectives: z.string().optional(),
});

const createSchema = baseSchema.extend({
  name: z.string().regex(/^[a-z0-9.\-]+\.[a-z]{2,}$/i, 'Must be a valid FQDN'),
  serverId: z.string().uuid('Pick a server'),
  issueSsl: z.boolean().default(true),
});

type CreateValues = z.input<typeof createSchema>;
type EditValues = z.input<typeof baseSchema>;

export function SubdomainForm({
  onSuccess,
  subdomain,
}: {
  onSuccess: () => void;
  subdomain?: Subdomain;
}) {
  const isEdit = !!subdomain;
  return isEdit ? (
    <EditForm onSuccess={onSuccess} subdomain={subdomain!} />
  ) : (
    <CreateForm onSuccess={onSuccess} />
  );
}

function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: servers } = useQuery({
    queryKey: ['servers', { all: true }],
    queryFn: () => listServers({ pageSize: 200 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      upstreamPort: 80,
      upstreamScheme: 'http',
      forceHttps: true,
      websocket: false,
      issueSsl: true,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      createSubdomain({ ...values, upstreamPort: Number(values.upstreamPort) }),
    onSuccess: () => {
      toast.success('Subdomain created');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain" error={errors.name?.message}>
          <input className="input" {...register('name')} placeholder="app.example.com" />
        </Field>
        <Field label="Server" error={errors.serverId?.message}>
          <select className="input" {...register('serverId')}>
            <option value="">— select —</option>
            {servers?.items?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.host})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Upstream scheme">
          <select className="input" {...register('upstreamScheme')}>
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
        </Field>
        <Field label="Upstream host" error={errors.upstreamHost?.message}>
          <input className="input" {...register('upstreamHost')} placeholder="127.0.0.1 or container" />
        </Field>
        <Field label="Upstream port" error={errors.upstreamPort?.message}>
          <input className="input" type="number" {...register('upstreamPort')} />
        </Field>
        <Field label="Max body size">
          <input className="input" {...register('clientMaxBodySize')} placeholder="100M" />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('forceHttps')} /> Redirect HTTP → HTTPS
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('websocket')} /> Enable WebSocket
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('issueSsl')} /> Issue Let's Encrypt cert
        </label>
      </div>

      <Field label="Custom nginx directives (advanced)">
        <textarea className="input font-mono text-xs" rows={4} {...register('customDirectives')} />
      </Field>

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn-primary" disabled={isSubmitting || mutation.isPending}>
          {(isSubmitting || mutation.isPending) && <Loader2 className="animate-spin" size={16} />}
          Create subdomain
        </button>
      </div>
    </form>
  );
}

function EditForm({
  onSuccess,
  subdomain,
}: {
  onSuccess: () => void;
  subdomain: Subdomain;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      upstreamScheme: subdomain.upstreamScheme,
      upstreamHost: subdomain.upstreamHost,
      upstreamPort: subdomain.upstreamPort,
      forceHttps: subdomain.forceHttps,
      websocket: subdomain.websocket,
      clientMaxBodySize: subdomain.clientMaxBodySize ?? '',
      customDirectives: subdomain.customDirectives ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: EditValues) =>
      updateSubdomain(subdomain.id, {
        ...values,
        upstreamPort: Number(values.upstreamPort),
        clientMaxBodySize: values.clientMaxBodySize?.trim() || undefined,
        customDirectives: values.customDirectives?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Subdomain updated, nginx reloaded');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain (read-only)">
          <input className="input" value={subdomain.name} disabled />
        </Field>
        <Field label="Server (read-only)">
          <input
            className="input"
            value={subdomain.server ? `${subdomain.server.name} (${subdomain.server.host})` : subdomain.serverId}
            disabled
          />
        </Field>
        <Field label="Upstream scheme">
          <select className="input" {...register('upstreamScheme')}>
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
        </Field>
        <Field label="Upstream host" error={errors.upstreamHost?.message}>
          <input className="input" {...register('upstreamHost')} placeholder="127.0.0.1 or container" />
        </Field>
        <Field label="Upstream port" error={errors.upstreamPort?.message}>
          <input className="input" type="number" {...register('upstreamPort')} />
        </Field>
        <Field label="Max body size">
          <input className="input" {...register('clientMaxBodySize')} placeholder="100M" />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('forceHttps')} /> Redirect HTTP → HTTPS
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('websocket')} /> Enable WebSocket
        </label>
      </div>

      <Field label="Custom nginx directives (advanced)">
        <textarea className="input font-mono text-xs" rows={4} {...register('customDirectives')} />
      </Field>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting || mutation.isPending || !isDirty}
        >
          {(isSubmitting || mutation.isPending) && <Loader2 className="animate-spin" size={16} />}
          Save changes
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
