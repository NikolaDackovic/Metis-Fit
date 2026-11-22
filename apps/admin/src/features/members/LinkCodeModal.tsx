import type { LinkCodeDto } from '@grit/validation';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';

/** Shows a one-time 6-digit code the member types into the app to link their account. */
export function LinkCodeModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const issue = useMutation({
    mutationFn: () => api.post<LinkCodeDto>(`/admin/members/${memberId}/link-code`),
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    issue.mutate();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // runs once: a code is issued when the dialog opens
  }, []);

  const secondsLeft = issue.data
    ? Math.max(0, Math.round((Date.parse(issue.data.expiresAt) - now) / 1000))
    : 0;
  const expired = issue.data && secondsLeft === 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('admin.members.link_code_title')}
      description={t('admin.members.link_code_hint')}
      footer={
        <>
          {expired && (
            <Button variant="secondary" onClick={() => issue.mutate()} loading={issue.isPending}>
              {t('admin.members.link_code_new')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {issue.isError ? (
        <ErrorState error={issue.error} />
      ) : !issue.data ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <p
            className={`tabular font-display text-5xl tracking-[0.2em] ${expired ? 'text-text-muted line-through' : ''}`}
            aria-live="polite"
          >
            {issue.data.code}
          </p>
          <p className="tabular text-sm text-text-secondary">
            {expired
              ? t('admin.members.link_code_expired')
              : t('admin.members.link_code_valid', {
                  time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
                })}
          </p>
        </div>
      )}
    </Modal>
  );
}
