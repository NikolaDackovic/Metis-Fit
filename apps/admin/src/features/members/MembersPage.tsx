import type { MemberListItemDto } from '@grit/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { MemberFormModal } from './MemberFormModal';

const STATUS_FILTERS = ['', 'active', 'expiring_soon', 'expired', 'none'] as const;
const PAGE_SIZE = 25;

export function MembersPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [creating, setCreating] = useState(false);

  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);

  // Debounce typing into the URL (the URL is the source of truth: shareable, survives refresh).
  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== q) update({ q: search, page: '' });
    }, 250);
    return () => clearTimeout(id);
  }, [search]); // intentionally only on typing; `update` reads the latest params

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  }

  const list = useQuery({
    queryKey: ['members', { q, status, page }],
    queryFn: () =>
      api.page<MemberListItemDto[]>('/admin/members', {
        q,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('admin.members.title')}
        actions={
          can('members.create') && (
            <Button icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
              {t('admin.members.new')}
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 md:flex-row md:flex-wrap md:items-center">
          <div className="relative w-full md:min-w-64 md:flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              aria-label={t('common.search')}
              placeholder={t('admin.members.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
              autoFocus={window.matchMedia('(min-width: 768px)').matches}
            />
          </div>
          <div
            role="group"
            aria-label={t('admin.members.filter_status')}
            className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
          >
            {STATUS_FILTERS.map((s) => (
              <button
                key={s || 'all'}
                type="button"
                aria-pressed={status === s}
                onClick={() => update({ status: s, page: '' })}
                className={cn(
                  'h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold md:h-8',
                  status === s
                    ? 'border-accent-500 bg-accent-tint text-text-primary'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary',
                )}
              >
                {s === ''
                  ? t('admin.members.all')
                  : s === 'none'
                    ? t('admin.members.no_membership')
                    : t(`membership.status.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q || status ? t('admin.members.no_results') : t('admin.members.empty')}
            description={q || status ? undefined : t('admin.members.empty_hint')}
          />
        ) : (
          <>
            {/* Phone: card list (no horizontal scrolling) */}
            <ul className="divide-y divide-border-subtle md:hidden">
              {list.data.items.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/members/${m.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3.5 active:bg-bg-surface2',
                      m.deactivatedAt && 'opacity-50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="tabular truncate text-xs text-text-secondary">
                        {m.memberNumber} · {m.phone ?? m.email ?? '-'}
                      </p>
                      {m.currentPlanName && (
                        <p className="mt-1 truncate text-xs text-text-secondary">
                          {m.currentPlanName} ·{' '}
                          {t('admin.dashboard.until', { date: f.date(m.currentEndDate) })}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={m.currentStatus} />
                    <ChevronRight
                      className="size-4 shrink-0 text-text-muted rtl:rotate-180"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('admin.fields.member')}</Th>
                    <Th>{t('admin.fields.contact')}</Th>
                    <Th>{t('admin.fields.status')}</Th>
                    <Th>{t('admin.fields.plan')}</Th>
                    <Th>{t('admin.fields.valid_until')}</Th>
                    <Th>{t('admin.fields.last_visit')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((m) => (
                    <tr
                      key={m.id}
                      tabIndex={0}
                      onClick={() => navigate(`/members/${m.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/members/${m.id}`)}
                      className={cn(
                        'cursor-pointer hover:bg-bg-surface2 focus-visible:bg-bg-surface2',
                        m.deactivatedAt && 'opacity-50',
                      )}
                    >
                      <Td>
                        <p className="font-semibold">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="tabular text-xs text-text-secondary">{m.memberNumber}</p>
                      </Td>
                      <Td className="text-text-secondary">
                        <p>{m.phone ?? '-'}</p>
                        <p className="text-xs">{m.email ?? ''}</p>
                      </Td>
                      <Td>
                        <StatusBadge status={m.currentStatus} />
                      </Td>
                      <Td className="text-text-secondary">{m.currentPlanName ?? '-'}</Td>
                      <Td className="tabular">{f.date(m.currentEndDate)}</Td>
                      <Td className="tabular text-text-secondary">{f.dateTime(m.lastVisitAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <Pagination
              page={list.data.meta.page}
              pageSize={list.data.meta.pageSize}
              total={list.data.meta.total}
              onPage={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </Card>

      {creating && (
        <MemberFormModal
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false);
            navigate(`/members/${m.id}`);
          }}
        />
      )}
    </>
  );
}
