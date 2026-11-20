import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-[0.7rem] font-semibold tracking-[0.04em] text-emerald-900',
        className,
      )}
      {...props}
    />
  );
}
