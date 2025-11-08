import { useEffect, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '../lib/cn';
import { themeToCssVars } from '../lib/theme-css-vars';
import type { GameThemeDefinition } from '../lib/themes';

export interface DesignSystemProviderProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly asChild?: boolean;
  readonly disableRootReset?: boolean;
  readonly theme?: GameThemeDefinition;
}

const ROOT_CLASS = 'lb-design-root';

export const DesignSystemProvider = ({
  children,
  className,
  asChild,
  disableRootReset = false,
  theme,
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

  useEffect(() => {
    if (!theme || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const cssVars = themeToCssVars(theme);

    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }, [theme]);

  const Comp = asChild ? Slot : 'div';

  return <Comp className={cn('contents font-body text-foreground', className)}>{children}</Comp>;
};
