import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { introOverlayBridge, useIntroOverlay } from '../state/intro-bridge';

const reasonLabels: Record<string, string> = {
  'first-launch': 'First Launch Briefing',
  story: 'Mayhaps Chronicles',
  tutorial: 'Tutorial Primer',
};

export const IntroOverlayApp = (): JSX.Element | null => {
  const { visible, slides, activeIndex, allowSkip, completionLabel, advanceLabel, reason } =
    useIntroOverlay();
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

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
    introOverlayBridge.skip();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        introOverlayBridge.next();
      }
      if (event.key === 'Escape' && allowSkip) {
        event.preventDefault();
        introOverlayBridge.skip();
      }
    },
    [allowSkip],
  );

  const slide = slides[activeIndex] ?? slides[slides.length - 1];

  const reasonLabel = useMemo(() => {
    if (!reason) {
      return 'Mayhaps Narrative';
    }
    return reasonLabels[reason] ?? 'Mayhaps Narrative';
  }, [reason]);

  if (!visible || !slide) {
    return null;
  }

  const isLastSlide = activeIndex >= slides.length - 1;
  const primaryLabel = isLastSlide ? completionLabel : advanceLabel;

  return (
    <div className="intro-overlay" role="presentation">
      <div className="intro-overlay-backdrop" aria-hidden="true" />
      <section
        className="intro-overlay-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-overlay-heading"
        onKeyDown={handleKeyDown}
      >
        <header className="intro-overlay-header">
          <p className="intro-overlay-tag">{reasonLabel}</p>
          <div className="intro-overlay-progress" aria-hidden="true">
            {slides.map((_, index) => (
              <span
                key={slides[index]?.id ?? index}
                className={index <= activeIndex ? 'active' : ''}
              />
            ))}
          </div>
        </header>
        <article className="intro-overlay-body">
          <h2 id="intro-overlay-heading">{slide.heading}</h2>
          {slide.body.map((paragraph, index) => (
            <p key={`${slide.id}-p-${index}`}>{paragraph}</p>
          ))}
          {slide.caption ? (
            <footer className="intro-overlay-caption">{slide.caption}</footer>
          ) : null}
        </article>
        <footer className="intro-overlay-footer">
          <button
            type="button"
            className="intro-overlay-primary ui-interactive"
            onClick={handleAdvance}
            ref={primaryButtonRef}
          >
            {primaryLabel}
          </button>
          {allowSkip ? (
            <button
              type="button"
              className="intro-overlay-secondary ui-interactive"
              onClick={handleSkip}
            >
              Skip
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
};
