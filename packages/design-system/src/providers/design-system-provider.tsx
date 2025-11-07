import { useEffect, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '../lib/cn';

export interface DesignSystemProviderProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly asChild?: boolean;
  readonly disableRootReset?: boolean;
}

const ROOT_CLASS = 'lb-design-root';

export const DesignSystemProvider = ({
  children,
  className,
  asChild,
  disableRootReset = false,
}: DesignSystemProviderProps): JSX.Element => {
  useEffect(() => {
    if (disableRootReset || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);
    return () => {
      root.classList.remove(ROOT_CLASS);
    };
  }, [disableRootReset]);

  const Comp = asChild ? Slot : 'div';

  return <Comp className={cn('contents font-body text-foreground', className)}>{children}</Comp>;
};
