import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { create } from 'zustand';
import { cn } from './cn';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const useToasts = create<{
  items: ToastItem[];
  push: (k: ToastKind, m: string) => void;
  remove: (id: number) => void;
}>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-2), { id, kind, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/** Short confirmation messages only. Errors that need action belong next to the form, not in a toast. */
export const toast = {
  success: (message: string) => useToasts.getState().push('success', message),
  error: (message: string) => useToasts.getState().push('error', message),
  info: (message: string) => useToasts.getState().push('info', message),
};

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const tone = {
  success: 'text-status-success',
  error: 'text-status-danger',
  info: 'text-text-secondary',
};

export function ToastViewport() {
  const items = useToasts((s) => s.items);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed end-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      {items.map((i) => {
        const Icon = icons[i.kind];
        return (
          <div
            key={i.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-border-subtle bg-bg-elevated px-4 py-3 text-sm shadow-lg"
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', tone[i.kind])} aria-hidden />
            <span>{i.message}</span>
          </div>
        );
      })}
    </div>
  );
}
