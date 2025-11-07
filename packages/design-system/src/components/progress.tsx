import * as ProgressPrimitive from '@radix-ui/react-progress';
import { forwardRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

export type ProgressProps = ProgressPrimitive.ProgressProps;

export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ProgressPrimitive.ProgressProps
>(({ className, value = 0, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-3 w-full overflow-hidden rounded-full bg-muted/30', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-powerup shadow-[0_0_12px_rgba(0,255,157,0.45)] transition-all"
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }}
    />
  </ProgressPrimitive.Root>
));

Progress.displayName = ProgressPrimitive.Root.displayName ?? 'Progress';
