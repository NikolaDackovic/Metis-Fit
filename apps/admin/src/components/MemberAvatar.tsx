import { cn } from '@/components/ui/cn';

/** Member photo (gym photo or the app profile photo); initials when there is none. */
export function MemberAvatar({
  url,
  firstName,
  lastName,
  className,
}: {
  url?: string | null;
  firstName: string;
  lastName: string;
  className?: string;
}) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return url ? (
    <img
      src={url}
      alt=""
      className={cn(
        'size-16 shrink-0 rounded-full border border-border-strong object-cover',
        className,
      )}
      draggable={false}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex size-16 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-surface2 text-lg font-bold text-text-secondary',
        className,
      )}
    >
      {initials}
    </span>
  );
}
