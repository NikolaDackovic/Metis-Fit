import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

const control =
  'w-full rounded-sm border bg-bg-surface2 px-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-400 disabled:opacity-60';

/** Label above, hint/error below. `error` is a translation key returned by zod or the API. */
export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-wide text-text-secondary uppercase"
      >
        {label}
        {required && <span className="ms-0.5 text-accent-400">*</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-status-danger">
          {t(error, { defaultValue: t('errors.validation.failed') })}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        control,
        'h-10 aria-[invalid=true]:border-status-danger border-border-subtle',
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      className={cn(
        control,
        'min-h-24 border-border-subtle py-2 aria-[invalid=true]:border-status-danger',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  ref,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        'h-10 border-border-subtle aria-[invalid=true]:border-status-danger',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
