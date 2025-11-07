import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

export type PanelTone = 'default' | 'muted' | 'accent';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: PanelTone;
}

const toneClassMap: Record<PanelTone, string> = {
  default: 'bg-card text-card-foreground shadow-surface',
  muted: 'bg-muted text-muted-foreground border border-border/60',
  accent: 'bg-accent text-accent-foreground shadow focus-within:ring-2 focus-within:ring-accent',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ className, tone = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg p-6 transition-colors', toneClassMap[tone], className)}
      {...props}
    />
  ),
);

Panel.displayName = 'Panel';
