import type { CafeSettingsBody, CafeSettingsDto, CafeTableDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Printer, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

const APP_URL = (
  (import.meta.env.VITE_MEMBER_APP_URL as string | undefined) ?? 'http://localhost:8081'
).replace(/\/$/, '');
export const tableUrl = (code: string) => `${APP_URL}/order/${code}`;

/** Café setup: tables with printable QR codes, switches and the POS / fiscal adapter. */
export function CafeSetupPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('admin.cafe.setup_title')} subtitle={t('admin.cafe.setup_subtitle')} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TablesCard />
        <SettingsCard />
      </div>
    </>
  );
}

function QrImage({ code, size = 160 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(tableUrl(code), { margin: 1, width: size * 2 }).then(setSrc);
  }, [code, size]);
  return src ? (
    <img src={src} alt="" width={size} height={size} className="rounded-xs bg-white p-1" />
  ) : (
    <span style={{ width: size, height: size }} className="block rounded-xs bg-bg-surface2" />
  );
}

function printTable(table: CafeTableDto, title: string, hint: string) {
  void QRCode.toDataURL(tableUrl(table.code), { margin: 1, width: 600 }).then((src) => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>${esc(table.label)}</title>` +
        `<body style="font-family:sans-serif;text-align:center;padding:24px">` +
        `<h1 style="margin:0 0 8px">${esc(title)}</h1><h2 style="margin:0 0 16px">${esc(table.label)}</h2>` +
        `<img src="${src}" style="width:320px;height:320px"><p>${esc(hint)}</p>` +
        `<script>onload=()=>print()</script></body>`,
    );
    w.document.close();
  });
}

function TablesCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['cafe-tables'],
    queryFn: () => api.get<CafeTableDto[]>('/admin/cafe/tables'),
  });
  const [editing, setEditing] = useState<CafeTableDto | 'new' | null>(null);
  const regen = useMutation({
    mutationFn: (id: string) => api.post(`/admin/cafe/tables/${id}/regenerate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cafe-tables'] });
      toast.success(t('admin.cafe.qr_regenerated'));
    },
  });
  return (
    <Card>
      <CardHeader
        title={t('admin.cafe.tables')}
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.cafe.new_table')}
          </Button>
        }
      />
      <p className="px-4 pt-3 text-xs text-text-secondary">{t('admin.cafe.tables_hint')}</p>
      {q.isPending ? (
        <Skeleton className="m-4 h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((tb) => (
            <li
              key={tb.id}
              className="flex flex-col items-center gap-2 rounded-sm border border-border-subtle p-3 text-sm"
            >
              <QrImage code={tb.code} />
              <p className="font-semibold">
                {tb.label} {!tb.isActive && <Badge tone="neutral">{t('admin.cafe.hidden')}</Badge>}
              </p>
              <div className="flex gap-1">
                <IconButton
                  label={t('admin.cafe.print')}
                  onClick={() =>
                    printTable(tb, t('admin.cafe.print_title'), t('admin.cafe.print_hint'))
                  }
                >
                  <Printer className="size-4" />
                </IconButton>
                <IconButton label={t('common.edit')} onClick={() => setEditing(tb)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('admin.cafe.regenerate')}
                  onClick={() => {
                    if (window.confirm(t('admin.cafe.regenerate_confirm'))) regen.mutate(tb.id);
                  }}
                >
                  <RefreshCw className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TableModal
          table={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function TableModal({ table, onClose }: { table?: CafeTableDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState(table?.label ?? '');
  const [active, setActive] = useState(table?.isActive ?? true);
  const save = useMutation({
    mutationFn: () => {
      const b = { label: label.trim(), isActive: active, sortOrder: table?.sortOrder ?? 0 };
      return table
        ? api.put(`/admin/cafe/tables/${table.id}`, b)
        : api.post('/admin/cafe/tables', b);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cafe-tables'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={table ? table.label : t('admin.cafe.new_table')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!label.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('admin.cafe.table_label')} required>
          {(p) => (
            <Input {...p} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t('admin.cafe.table_active')}
        </label>
      </div>
    </Modal>
  );
}

function SettingsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['cafe-settings'],
    queryFn: () => api.get<CafeSettingsDto>('/admin/cafe/settings'),
  });
  const [f, setF] = useState<CafeSettingsBody | null>(null);
  useEffect(() => {
    if (q.data)
      setF({
        enabled: q.data.enabled,
        tableOrdering: q.data.tableOrdering,
        posMode: q.data.posMode,
        posUrl: q.data.posUrl,
      });
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/admin/cafe/settings', f),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cafe-settings'] });
      toast.success(t('admin.cafe.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  if (!q.data || !f) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader
        title={t('admin.cafe.settings')}
        action={
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-4 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={f.enabled}
            onChange={(e) => setF({ ...f, enabled: e.target.checked })}
          />
          {t('admin.cafe.enabled')}
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={f.tableOrdering}
            onChange={(e) => setF({ ...f, tableOrdering: e.target.checked })}
          />
          {t('admin.cafe.table_ordering')}
        </label>
        <div className="flex flex-col gap-3 rounded-sm border border-border-subtle p-3">
          <p className="font-semibold">{t('admin.cafe.pos_title')}</p>
          <p className="text-xs text-text-secondary">{t('admin.cafe.pos_hint')}</p>
          <Field label={t('admin.cafe.pos_mode')}>
            {(p) => (
              <Select
                {...p}
                value={f.posMode}
                onChange={(e) =>
                  setF({ ...f, posMode: e.target.value as CafeSettingsBody['posMode'] })
                }
              >
                <option value="none">{t('admin.cafe.pos_none')}</option>
                <option value="webhook">{t('admin.cafe.pos_webhook')}</option>
              </Select>
            )}
          </Field>
          {f.posMode === 'webhook' && (
            <>
              <Field label={t('admin.cafe.pos_url')} required>
                {(p) => (
                  <Input
                    {...p}
                    value={f.posUrl ?? ''}
                    placeholder="https://"
                    onChange={(e) => setF({ ...f, posUrl: e.target.value })}
                  />
                )}
              </Field>
              <p className="text-xs">
                {q.data.secretConfigured ? (
                  <Badge tone="success">{t('admin.cafe.secret_ok')}</Badge>
                ) : (
                  <Badge tone="warning">{t('admin.cafe.secret_missing')}</Badge>
                )}
              </p>
            </>
          )}
          {(q.data.failedOrders > 0 || q.data.pendingOrders > 0) && (
            <p className="text-xs text-status-warning">
              {t('admin.cafe.fiscal_queue', {
                failed: q.data.failedOrders,
                pending: q.data.pendingOrders,
              })}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
