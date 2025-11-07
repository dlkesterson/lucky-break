import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/dom';
import type { Root } from 'react-dom/client';
import type { GameThemeDefinition } from 'render/theme';
import type { HudEntropyActionDescriptor } from 'render/hud';
import {
    PauseView,
    type PauseViewProps,
    formatScore,
    formatCoins,
    isEntropyActionAvailable,
} from '../../../../src/ui/scenes/PauseView';
import { wrapWithI18n } from '../../../utils/test-wrapper';

describe('PauseView', () => {
    let container: HTMLDivElement;
    let root: Root | null;

    const mockTheme = {
        hud: {
            panelFill: '#222222',
            panelLine: '#333333',
            textPrimary: '#fdf8ff',
            textSecondary: '#d0bcff',
        },
        accents: { combo: '#ffd45c' },
    } as GameThemeDefinition;

    const mockEntropyAction: HudEntropyActionDescriptor = {
        action: 'reroll' as const,
        label: 'Reroll',
        hotkey: 'R',
        cost: 50,
        charges: 0,
        affordable: true,
    };

    const defaultProps: PauseViewProps = {
        visible: true,
        title: 'Paused',
        description: 'Game paused',
        score: 12345,
        coins: 100,
        entropyActions: [mockEntropyAction],
        legendTitle: 'Power-ups',
        legendItems: [
            { type: 'paddle-width' as const, text: 'Line 1' },
            { text: 'Line 2' },
        ],
        resumeLabel: 'Resume',
        quitLabel: 'Quit',
        pending: null,
        theme: mockTheme,
        themeLabel: 'Toggle Theme',
        volumePercent: 75,
        muted: false,
        overlayStyle: {},
        scorePanelStyle: {},
        storePanelStyle: {},
        legendPanelStyle: {},
        onResume: vi.fn(),
        onQuit: vi.fn(),
        onVolumeChange: vi.fn(),
        onMuteToggle: vi.fn(),
        onThemeToggle: vi.fn(),
        onEntropyAction: vi.fn(),
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = null;
    });

    afterEach(() => {
        if (root) {
            act(() => {
                root?.unmount();
            });
        }
        document.body.removeChild(container);
    });

    const renderComponent = (props: PauseViewProps) => {
        root = createRoot(container);
        act(() => {
            root?.render(wrapWithI18n(createElement(PauseView, props)));
        });
    };

    it('returns null when not visible', () => {
        renderComponent({ ...defaultProps, visible: false });
        expect(container.innerHTML).toBe('');
    });

    it('renders the title and description', () => {
        renderComponent(defaultProps);
        // Dialog renders to portal, so query document instead of container
        expect(document.body.textContent).toContain('Paused');
        expect(document.body.textContent).toContain('Game paused');
    });

    it('formats and displays the score', () => {
        renderComponent({ ...defaultProps, score: 12345 });
        expect(document.body.textContent).toContain('12,345');
    });

    it('formats and displays coins', () => {
        renderComponent({ ...defaultProps, coins: 500 });
        expect(document.body.textContent).toContain('500c');
    });

    it('renders entropy actions when present', () => {
        renderComponent(defaultProps);
        expect(document.body.textContent).toContain('Reroll');
    });

    it('displays empty state when no entropy actions', () => {
        renderComponent({ ...defaultProps, entropyActions: [] });
        expect(document.body.textContent).toContain('No entropy plays available');
    });

    it('calls onEntropyAction when clicking an action button', () => {
        const onEntropyAction = vi.fn();
        renderComponent({ ...defaultProps, onEntropyAction });
        const ctx = within(document.body);
        const button = ctx.getByText('Reroll').closest('button');
        expect(button).toBeDefined();
        act(() => {
            button?.click();
        });
        expect(onEntropyAction).toHaveBeenCalledWith('reroll');
    });

    it('calls onResume when clicking resume button', () => {
        const onResume = vi.fn(async () => { });
        renderComponent({ ...defaultProps, onResume });
        const ctx = within(document.body);
        const resumeButton = ctx.getByText('Resume');
        act(() => {
            resumeButton.click();
        });
        expect(onResume).toHaveBeenCalled();
    });

    it('calls onQuit when clicking quit button', () => {
        const onQuit = vi.fn(async () => { });
        renderComponent({ ...defaultProps, onQuit });
        const ctx = within(document.body);
        const quitButton = ctx.getByText('Quit');
        act(() => {
            quitButton.click();
        });
        expect(onQuit).toHaveBeenCalled();
    });

    it('does not render quit button when onQuit is null', () => {
        renderComponent({ ...defaultProps, onQuit: null, quitLabel: null });
        const ctx = within(document.body);
        expect(ctx.queryByText('Quit')).toBeNull();
    });

    it('disables buttons when pending', () => {
        renderComponent({ ...defaultProps, pending: 'resume' });
        const ctx = within(document.body);
        const resumeButton = ctx.getByText('Resume');
        expect(resumeButton.hasAttribute('disabled')).toBe(true);
    });

    it('renders legend lines when present', () => {
        renderComponent(defaultProps);
        expect(document.body.textContent).toContain('Line 1');
        expect(document.body.textContent).toContain('Line 2');
    });

    it('displays empty state when no legend lines', () => {
        renderComponent({ ...defaultProps, legendItems: [], legendTitle: null });
        expect(document.body.textContent).toContain('No legend entries yet');
    });

    it('renders volume slider with current value', () => {
        renderComponent(defaultProps);
        const ctx = within(document.body);
        const slider = ctx.getByDisplayValue('75');
        expect(slider).toBeDefined();
        expect((slider as HTMLInputElement).type).toBe('range');
    });

    it('renders mute checkbox with current state', () => {
        renderComponent({ ...defaultProps, muted: true });
        const ctx = within(document.body);
        const checkbox = ctx.getByRole('checkbox');
        expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    it('calls onThemeToggle when clicking theme button', () => {
        const onThemeToggle = vi.fn();
        renderComponent({ ...defaultProps, onThemeToggle });
        const ctx = within(document.body);
        const themeButton = ctx.getByText('Toggle Theme');
        act(() => {
            themeButton.click();
        });
        expect(onThemeToggle).toHaveBeenCalled();
    });

    it('attaches overlay ref when provided', () => {
        const ref = { current: null as HTMLDivElement | null };
        renderComponent({ ...defaultProps, overlayRef: ref });
        expect(ref.current).toBeDefined();
        expect(ref.current?.tagName).toBe('DIV');
    });

    describe('formatScore', () => {
        it('formats positive scores with commas', () => {
            expect(formatScore(12345)).toBe('12,345');
            expect(formatScore(1000000)).toBe('1,000,000');
        });

        it('returns "0" for non-positive values', () => {
            expect(formatScore(0)).toBe('0');
            expect(formatScore(-100)).toBe('0');
        });

        it('handles non-finite values', () => {
            expect(formatScore(NaN)).toBe('0');
            expect(formatScore(Infinity)).toBe('0');
        });
    });

    describe('formatCoins', () => {
        it('formats positive coin values with suffix', () => {
            expect(formatCoins(500)).toBe('500c');
            expect(formatCoins(1234)).toBe('1,234c');
        });

        it('returns "0c" for non-positive values', () => {
            expect(formatCoins(0)).toBe('0c');
            expect(formatCoins(-50)).toBe('0c');
        });

        it('handles non-finite values', () => {
            expect(formatCoins(NaN)).toBe('0c');
            expect(formatCoins(Infinity)).toBe('0c');
        });
    });

    describe('isEntropyActionAvailable', () => {
        it('returns true when charges are available', () => {
            const descriptor = { ...mockEntropyAction, charges: 1, affordable: false };
            expect(isEntropyActionAvailable(descriptor)).toBe(true);
        });

        it('returns true when affordable', () => {
            const descriptor = { ...mockEntropyAction, charges: 0, affordable: true };
            expect(isEntropyActionAvailable(descriptor)).toBe(true);
        });

        it('returns false when not affordable and no charges', () => {
            const descriptor = { ...mockEntropyAction, charges: 0, affordable: false };
            expect(isEntropyActionAvailable(descriptor)).toBe(false);
        });
    });
});
