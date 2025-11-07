import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  TooltipPrimitive.TooltipContentProps
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 rounded-full bg-fg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-bg shadow-lg',
      'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
      'data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName ?? 'TooltipContent';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
