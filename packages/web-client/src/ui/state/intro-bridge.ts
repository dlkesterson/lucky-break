import { create } from 'zustand';

export type IntroSequenceReason = 'first-launch' | 'story' | 'tutorial';

export interface IntroSlideView {
    readonly id: string;
    readonly heading: string;
    readonly body: readonly string[];
    readonly caption?: string;
}

export interface IntroOverlayOpenOptions {
    readonly slides: readonly IntroSlideView[];
    readonly reason: IntroSequenceReason;
    readonly completionLabel?: string;
    readonly advanceLabel?: string;
    readonly onComplete?: () => void | Promise<void>;
}

interface IntroOverlayState {
    readonly visible: boolean;
    readonly slides: readonly IntroSlideView[];
    readonly activeIndex: number;
    readonly reason: IntroSequenceReason | null;
    readonly completionLabel: string;
    readonly advanceLabel: string;
    readonly onComplete: (() => void | Promise<void>) | null;
}

const createInitialState = (): IntroOverlayState => ({
    visible: false,
    slides: [],
    activeIndex: 0,
    reason: null,
    completionLabel: 'Begin',
    advanceLabel: 'Next',
    onComplete: null,
});

export const useIntroOverlay = create<IntroOverlayState>(() => createInitialState());

const cloneSlides = (slides: readonly IntroSlideView[]): IntroSlideView[] =>
    slides.map((slide) => ({
        ...slide,
        body: [...slide.body],
    } satisfies IntroSlideView));

const isPromiseLike = (value: unknown): value is Promise<unknown> =>
    typeof value === 'object' && value !== null && 'then' in (value as Record<string, unknown>);

const runCompletion = (callback: (() => void | Promise<void>) | null): void => {
    if (!callback) {
        return;
    }
    try {
        const result = callback();
        if (isPromiseLike(result)) {
            result.catch((error) => {
                console.error('Intro overlay completion handler failed', error);
            });
        }
    } catch (error) {
        console.error('Intro overlay completion handler failed', error);
    }
};

const reset = () => {
    useIntroOverlay.setState(createInitialState(), true);
};

const finish = () => {
    const { onComplete } = useIntroOverlay.getState();
    reset();
    runCompletion(onComplete);
};

export const introOverlayBridge = {
    open(options: IntroOverlayOpenOptions): void {
        const slides = cloneSlides(options.slides);
        if (slides.length === 0) {
            console.warn('[intro-overlay] No slides provided; skipping intro sequence');
            runCompletion(options.onComplete ?? null);
            return;
        }

        useIntroOverlay.setState(
            {
                visible: true,
                slides,
                activeIndex: 0,
                reason: options.reason,
                completionLabel: options.completionLabel ?? 'Enter the Casino',
                advanceLabel: options.advanceLabel ?? 'Next',
                onComplete: options.onComplete ?? null,
            },
            true,
        );
    },
    close(): void {
        reset();
    },
    next(): void {
        const state = useIntroOverlay.getState();
        if (!state.visible) {
            return;
        }
        const { activeIndex, slides } = state;
        if (activeIndex < slides.length - 1) {
            useIntroOverlay.setState({ activeIndex: activeIndex + 1 });
            return;
        }
        finish();
    },
    setIndex(index: number): void {
        const state = useIntroOverlay.getState();
        if (!state.visible) {
            return;
        }
        const bounded = Math.max(0, Math.min(index, state.slides.length - 1));
        if (bounded === state.activeIndex) {
            return;
        }
        useIntroOverlay.setState({ activeIndex: bounded });
    },
    isActive(): boolean {
        return useIntroOverlay.getState().visible;
    },
};
