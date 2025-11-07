import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

type BaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const baseButtonStyles =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ' +
  'ring-offset-background';

export const buttonVariants = cva(baseButtonStyles, {
  variants: {
    variant: {
      default:
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow focus-visible:ring-primary',
      subtle:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm focus-visible:ring-secondary',
      outline:
        'border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring',
      ghost: 'hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring',
      link: 'text-primary underline-offset-4 hover:underline focus-visible:ring-transparent',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive',
    },
    size: {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-sm px-3',
      lg: 'h-11 rounded-lg px-6 text-base',
      icon: 'h-10 w-10',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export type ButtonVariant = VariantProps<typeof buttonVariants>;

export type ButtonProps = BaseButtonProps &
  ButtonVariant & {
    readonly asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        type={asChild ? undefined : type}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
