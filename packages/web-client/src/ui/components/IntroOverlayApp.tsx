import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Button, Heading, Label, Mono, cn } from '@lucky-break/design-system';

import { introOverlayBridge, useIntroOverlay } from '../state/intro-bridge';

const reasonLabels: Record<string, string> = {
  'first-launch': 'First Launch Briefing',
  story: 'Mayhaps Chronicles',
  tutorial: 'Tutorial Primer',
};

export const IntroOverlayApp = (): JSX.Element | null => {
  const { visible, slides, activeIndex, allowSkip, completionLabel, advanceLabel, reason } =
    useIntroOverlay();

  const slide = slides[activeIndex] ?? null;
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const surfaceStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(160deg, rgba(22, 12, 42, 0.9), rgba(52, 24, 64, 0.82))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const backdropStyle = useMemo(
    () =>
      ({
        background:
          'radial-gradient(circle at 28% 24%, rgba(142,116,255,0.25), transparent 55%), radial-gradient(circle at 72% 68%, rgba(255,156,92,0.22), transparent 62%), linear-gradient(130deg, rgba(12,8,24,0.92), rgba(26,14,38,0.88))',
      }) as CSSProperties,
    [],
  );

  const reasonLabel = (reason ? reasonLabels[reason] : null) ?? 'Narrative Briefing';

  useEffect(() => {
    if (!visible) {
      return;
    }

    const doc = primaryButtonRef.current?.ownerDocument ?? document;
    const previouslyFocused = doc.activeElement as HTMLElement | null;
    primaryButtonRef.current?.focus();

    return () => {
      previouslyFocused?.focus?.();
    };
  }, [visible, activeIndex]);

  const handleAdvance = useCallback(() => {
    introOverlayBridge.next();
  }, []);

  const handleSkip = useCallback(() => {
    if (!allowSkip) {
      return;
    }
    introOverlayBridge.skip();
  }, [allowSkip]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleAdvance();
        return;
      }

      if (allowSkip && (event.key === 'Escape' || event.key === 'Backspace')) {
        event.preventDefault();
        handleSkip();
      }
    },
    [allowSkip, handleAdvance, handleSkip],
  );

  if (!visible || !slide) {
    return null;
  }

  const isLastSlide = activeIndex >= slides.length - 1;
  const primaryLabel = isLastSlide ? completionLabel : advanceLabel;

  const progressDotClass = (index: number) =>
    cn(
      'h-2.5 w-2.5 rounded-full bg-white/30 transition-all duration-150 ease-out',
      index <= activeIndex && 'scale-110 bg-[rgba(255,204,120,0.95)]',
    );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[12] flex items-center justify-center px-4 py-6 sm:px-6"
      role="presentation"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 backdrop-blur-[18px] backdrop-saturate-[1.12]"
        style={backdropStyle}
      />
      <section
        className="pointer-events-auto relative flex w-full max-w-[720px] flex-col gap-6 overflow-hidden rounded-[32px] border px-6 py-8 text-[rgba(248,244,255,0.92)] shadow-[0_28px_76px_rgba(10,4,22,0.62)] backdrop-blur-2xl sm:gap-7 sm:px-10 sm:py-10"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-overlay-heading"
        onKeyDown={handleKeyDown}
      >
        <header className="flex items-center justify-between gap-6">
          <Mono className="text-xs uppercase tracking-[0.18em] text-[rgba(255,220,160,0.85)]">
            {reasonLabel}
          </Mono>
          <div className="inline-flex items-center gap-2" aria-hidden="true">
            {slides.map((candidate, index) => (
              <span key={candidate.id} className={progressDotClass(index)} />
            ))}
          </div>
        </header>

        <article className="flex flex-col gap-5 text-[rgba(248,244,255,0.92)]">
          <Heading
            id="intro-overlay-heading"
            className="text-[clamp(32px,5vw,44px)] uppercase tracking-[0.06em] text-[#ffd271] drop-shadow-[0_16px_32px_rgba(0,0,0,0.45)]"
          >
            {slide.heading}
          </Heading>
          {slide.body.map((paragraph, index) => (
            <Label
              key={`${slide.id}-p-${index}`}
              className="text-[clamp(16px,2.1vmin,20px)] leading-relaxed tracking-[0.04em]"
            >
              {paragraph}
            </Label>
          ))}
          {slide.caption ? (
            <footer className="mt-4">
              <Mono className="text-xs uppercase tracking-[0.12em] text-[rgba(255,213,187,0.72)]">
                {slide.caption}
              </Mono>
            </footer>
          ) : null}
        </article>

        <footer className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="ui-interactive w-full rounded-full border border-[rgba(255,218,148,0.65)] bg-gradient-to-br from-[rgba(255,228,156,0.88)] to-[rgba(255,174,96,0.92)] font-mono text-sm uppercase tracking-[0.14em] text-[#140a0a] shadow-[0_18px_36px_rgba(255,186,102,0.32)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 sm:w-auto"
            onClick={handleAdvance}
            ref={primaryButtonRef}
            size="lg"
          >
            {primaryLabel}
          </Button>
          {allowSkip ? (
            <Button
              className="ui-interactive w-full rounded-full border border-white/20 bg-[rgba(24,16,48,0.72)] font-mono text-sm uppercase tracking-[0.14em] text-[rgba(255,236,210,0.88)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 sm:w-auto"
              onClick={handleSkip}
              variant="outline"
              size="lg"
            >
              Skip
            </Button>
          ) : null}
        </footer>
      </section>
    </div>
  );
};
