import type { ReactNode, HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

export interface TypographyProps extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  readonly children: ReactNode;
  readonly className?: string;
}

export const Heading = ({ children, className, ...props }: TypographyProps): JSX.Element => (
  <h1 className={cn('font-display text-6xl tracking-tight text-fg', className)} {...props}>
    {children}
  </h1>
);

export const Label = ({ children, className, ...props }: TypographyProps): JSX.Element => (
  <p className={cn('font-body text-lg text-muted', className)} {...props}>
    {children}
  </p>
);

export const Mono = ({ children, className, ...props }: TypographyProps): JSX.Element => (
  <code className={cn('font-mono text-sm text-combo', className)} {...props}>
    {children}
  </code>
);
