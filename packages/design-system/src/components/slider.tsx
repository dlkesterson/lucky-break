import * as SliderPrimitive from '@radix-ui/react-slider';
import { forwardRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  SliderPrimitive.SliderProps
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted/30">
      <SliderPrimitive.Range className="absolute h-full bg-combo" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-5 w-5 rounded-full border-2 border-bg bg-fg shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-combo disabled:pointer-events-none disabled:opacity-50"
      aria-label="Slider handle"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName ?? 'Slider';

export { Slider };
