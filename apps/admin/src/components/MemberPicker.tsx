import type { MemberDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';

export type PickedMember = { id: string; name: string; memberNumber: string };

/** Search a member by name, number, email or phone (optional: empty means "guest"). */
export function MemberPicker({
  value,
  onChange,
  placeholder,
}: {
  value: PickedMember | null;
  onChange: (m: PickedMember | null) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const term = q.trim();
  const search = useQuery({
    queryKey: ['members', 'search', term],
    queryFn: () => api.get<MemberDto[]>('/admin/members', { q: term, pageSize: 6 }),
    enabled: term.length >= 2 && !value,
  });
  if (value)
    return (
      <div className="flex h-10 items-center gap-2 rounded-sm border border-border-subtle bg-bg-surface2 px-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold">{value.name}</span>
        <span className="text-xs text-text-secondary">{value.memberNumber}</span>
        <IconButton label={t('common.close')} onClick={() => onChange(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
    );
  return (
    <div className="relative">
      <Input
        aria-label={placeholder ?? t('common.search')}
        placeholder={placeholder ?? t('common.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {term.length >= 2 && (search.data?.length ?? 0) > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 divide-y divide-border-subtle rounded-sm border border-border-subtle bg-bg-surface shadow-lg">
          {search.data!.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-bg-surface2"
                onClick={() => {
                  onChange({
                    id: m.id,
                    name: `${m.firstName} ${m.lastName}`,
                    memberNumber: m.memberNumber,
                  });
                  setQ('');
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {m.firstName} {m.lastName}
                </span>
                <span className="text-xs text-text-secondary">{m.memberNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
