import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

interface TypographyProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const Heading = ({ children, className }: TypographyProps): JSX.Element => (
  <h1 className={cn('font-display text-6xl tracking-tight text-fg', className)}>{children}</h1>
);

export const Label = ({ children, className }: TypographyProps): JSX.Element => (
  <p className={cn('font-body text-lg text-muted', className)}>{children}</p>
);

export const Mono = ({ children, className }: TypographyProps): JSX.Element => (
  <code className={cn('font-mono text-sm text-combo', className)}>{children}</code>
);
