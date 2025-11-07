import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

interface IntroSlideLike {
    readonly id: string;
    readonly heading: string;
    readonly body: readonly string[];
    readonly caption?: string;
}

interface IntroOverlayStateLike {
    readonly visible: boolean;
    readonly slides: readonly IntroSlideLike[];
    readonly activeIndex: number;
    readonly allowSkip: boolean;
    readonly reason: 'first-launch' | 'story' | 'tutorial' | null;
    readonly completionLabel: string;
    readonly advanceLabel: string;
}

const createOverlayState = (overrides: Partial<IntroOverlayStateLike> = {}): IntroOverlayStateLike => ({
    visible: false,
    slides: [],
    activeIndex: 0,
    allowSkip: true,
    reason: null,
    completionLabel: 'Begin',
    advanceLabel: 'Next',
    ...overrides,
});

let overlayState: IntroOverlayStateLike = createOverlayState();
const nextMock = vi.fn();
const skipMock = vi.fn();

vi.mock('ui/state/intro-bridge', () => ({
    useIntroOverlay: () => overlayState,
    introOverlayBridge: {
        next: nextMock,
        skip: skipMock,
    },
}));

describe('IntroOverlayApp', () => {
    let IntroOverlayAppComponent: typeof import('ui/components/IntroOverlayApp')['IntroOverlayApp'];
    let container: HTMLDivElement;
    let root: Root;

    const renderOverlay = async () => {
        await act(async () => {
            root.render(createElement(IntroOverlayAppComponent));
        });
    };

    beforeAll(async () => {
        ({ IntroOverlayApp: IntroOverlayAppComponent } = await import('ui/components/IntroOverlayApp'));
    });

    beforeEach(() => {
        overlayState = createOverlayState();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        vi.clearAllMocks();
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('returns null when the overlay is hidden or lacks slides', async () => {
        overlayState = createOverlayState({ visible: false });
        await renderOverlay();
        expect(container.innerHTML).toBe('');

        overlayState = createOverlayState({ visible: true, slides: [] });
        await renderOverlay();
        expect(container.innerHTML).toBe('');
    });

    it('renders the active slide and wires skip/advance actions', async () => {
        overlayState = createOverlayState({
            visible: true,
            reason: 'tutorial',
            slides: [
                { id: 'intro', heading: 'Welcome', body: ['Fortune favors the prepared.'], caption: 'Stay sharp' },
                { id: 'mechanics', heading: 'Mechanics', body: ['Break the bricks'] },
            ],
            activeIndex: 0,
            allowSkip: true,
            completionLabel: 'Enter the Casino',
            advanceLabel: 'Continue',
        });

        await renderOverlay();

        const screen = within(container);
        screen.getByText('Tutorial Primer');
        screen.getByRole('heading', { name: 'Welcome' });
        screen.getByText('Fortune favors the prepared.');
        screen.getByText('Stay sharp');

        const progressDots = container.querySelectorAll('header span');
        expect(progressDots.length).toBe(2);
        expect(progressDots[0]?.className).toContain('scale-110');

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(nextMock).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        expect(skipMock).toHaveBeenCalledTimes(1);
    });

    it('shows the completion label on the final slide and respects keyboard shortcuts', async () => {
        overlayState = createOverlayState({
            visible: true,
            slides: [{ id: 'final', heading: 'Final Briefing', body: ['Seal your wager.'] }],
            activeIndex: 0,
            allowSkip: false,
            completionLabel: 'Begin the Wager',
            advanceLabel: 'Keep Going',
            reason: null,
        });

        await renderOverlay();

        const screen = within(container);
        screen.getByText('Narrative Briefing');
        const dialog = screen.getByRole('dialog');

        const primaryButton = screen.getByRole('button', { name: 'Begin the Wager' });
        expect(primaryButton).toBe(document.activeElement);

        fireEvent.keyDown(dialog, { key: 'Enter' });
        fireEvent.keyDown(dialog, { key: ' ' });
        expect(nextMock).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(dialog, { key: 'Escape' });
        fireEvent.keyDown(dialog, { key: 'Backspace' });
        expect(skipMock).not.toHaveBeenCalled();
    });
});
