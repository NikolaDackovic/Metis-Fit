import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-500 text-on-accent font-semibold hover:bg-accent-400 active:bg-accent-600 disabled:bg-accent-500/40',
  secondary:
    'bg-bg-surface2 text-text-primary border border-border-strong hover:bg-bg-elevated disabled:text-text-muted',
  ghost:
    'text-text-secondary hover:text-text-primary hover:bg-bg-surface2 disabled:text-text-muted',
  danger:
    'bg-transparent text-status-danger border border-status-danger/50 hover:bg-status-danger/10 disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center justify-center rounded-sm whitespace-nowrap transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : icon}
      {/* Long labels (e.g. Russian) are cut with … instead of breaking out of the layout. */}
      {children != null && <span className="min-w-0 truncate">{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
