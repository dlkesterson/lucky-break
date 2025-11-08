import { beforeEach, describe, expect, it, vi } from 'vitest';
import { introOverlayBridge, useIntroOverlay, type IntroSlideView } from 'ui/state/intro-bridge';

const closeOverlay = () => {
    introOverlayBridge.close();
};

const createSlides = (): IntroSlideView[] => [
    { id: 'intro', heading: 'Awakening', body: ['Welcome'], caption: 'Prologue' },
    { id: 'stakes', heading: 'Stakes', body: ['Break the bricks.'] },
];

describe('introOverlayBridge', () => {
    beforeEach(() => {
        closeOverlay();
        vi.restoreAllMocks();
    });

    it('opens the overlay and clones slide data', () => {
        const slides = createSlides();

        introOverlayBridge.open({
            slides,
            reason: 'story',
        });

        const state = useIntroOverlay.getState();
        expect(state.visible).toBe(true);
        expect(state.reason).toBe('story');
        expect(state.completionLabel).toBe('Enter the Casino');
        expect(state.advanceLabel).toBe('Next');
        expect(state.slides).not.toBe(slides);
        expect(state.slides[0]?.body).not.toBe(slides[0]?.body);
    });

    it('advances through slides and resets after finishing', () => {
        const onComplete = vi.fn().mockResolvedValue(undefined);

        introOverlayBridge.open({
            slides: createSlides(),
            reason: 'tutorial',
            completionLabel: 'Begin',
            advanceLabel: 'Forward',
            onComplete,
        });

        introOverlayBridge.next();
        expect(useIntroOverlay.getState().activeIndex).toBe(1);
        expect(introOverlayBridge.isActive()).toBe(true);

        introOverlayBridge.next();
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(useIntroOverlay.getState().visible).toBe(false);
        expect(introOverlayBridge.isActive()).toBe(false);
    });

    it('clamps manual index changes and ignores updates when hidden', () => {
        introOverlayBridge.open({
            slides: [...createSlides(), { id: 'final', heading: 'Final', body: ['Good luck'] }],
            reason: 'tutorial',
        });

        introOverlayBridge.setIndex(2);
        expect(useIntroOverlay.getState().activeIndex).toBe(2);

        introOverlayBridge.setIndex(99);
        expect(useIntroOverlay.getState().activeIndex).toBe(2);

        introOverlayBridge.setIndex(-5);
        expect(useIntroOverlay.getState().activeIndex).toBe(0);

        introOverlayBridge.close();
        introOverlayBridge.setIndex(1);
        expect(useIntroOverlay.getState().activeIndex).toBe(0);
    });

    it('warns and completes immediately if slides are missing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const onComplete = vi.fn();

        introOverlayBridge.open({
            slides: [],
            reason: 'first-launch',
            onComplete,
        });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(useIntroOverlay.getState().visible).toBe(false);
    });
});
