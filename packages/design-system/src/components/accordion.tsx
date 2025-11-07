import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { forwardRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  AccordionPrimitive.AccordionItemProps
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn('border-b border-white/10', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionPrimitive.AccordionTriggerProps
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex flex-1 items-center justify-between py-4 text-left font-display text-2xl tracking-tight text-fg transition-all hover:text-combo',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-combo',
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className="ml-4 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 text-sm text-white/80 transition-transform duration-200 group-data-[state=open]:rotate-180"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="currentColor"
          role="presentation"
          focusable="false"
        >
          <path d="M4.23 7.3a1 1 0 0 1 1.54-.13L10 11.12l4.23-3.95a1 1 0 1 1 1.37 1.46l-5 4.67a1 1 0 0 1-1.37 0l-5-4.67a1 1 0 0 1-.13-1.53z" />
        </svg>
      </span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName ?? 'AccordionTrigger';

const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  AccordionPrimitive.AccordionContentProps
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-muted data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-4 pt-2 font-body text-base leading-relaxed text-fg/80', className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName ?? 'AccordionContent';

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
