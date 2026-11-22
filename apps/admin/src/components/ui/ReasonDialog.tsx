import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Field, Textarea } from './Field';
import { Modal } from './Modal';

/**
 * Confirmation for destructive/irreversible actions. States the consequence and,
 * where the business rules require it, collects a reason (min 3 chars) for the audit log.
 */
export function ReasonDialog({
  open,
  title,
  consequence,
  confirmLabel,
  onCancel,
  onConfirm,
  loading,
  error,
  children,
}: {
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!valid}
            loading={loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{consequence}</p>
        {children}
        <Field label={t('common.reason')} required error={error ?? undefined}>
          {(p) => (
            <Textarea
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
