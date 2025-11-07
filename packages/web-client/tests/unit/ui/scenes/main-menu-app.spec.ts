import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { within } from '@testing-library/dom';

import { MainMenuApp } from 'ui/scenes/MainMenuApp';
import { useMainMenuUi } from 'ui/state/main-menu-bridge';
import { useGameTheme } from 'ui/hooks/useGameTheme';
import { wrapWithI18n } from '../../../utils/test-wrapper';

vi.mock('ui/state/main-menu-bridge');
vi.mock('ui/hooks/useGameTheme');

describe('MainMenuApp', () => {
    let container: HTMLDivElement;
    let root: Root;
    const mockGameTheme = {
        background: { from: '#0a0814', to: '#1a1028' },
        hud: {
            panelFill: '#1e1632',
            panelLine: '#3a2a58',
            textPrimary: '#ffe9d6',
            textSecondary: '#ffc45a',
            accent: '#ffd04a',
            danger: '#ff0000',
        },
        accents: {
            combo: '#ff6b35',
            powerUp: '#ffcc66',
        },
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);

        vi.mocked(useGameTheme).mockReturnValue({
            theme: mockGameTheme as any,
            name: 'default',
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('returns null when not visible', () => {
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: false,
            suspended: false,
            snapshot: {
                title: 'Test Game',
                prompt: 'Press start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('returns null when suspended', () => {
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: true,
            snapshot: {
                title: 'Test Game',
                prompt: 'Press start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('returns null when snapshot is missing', () => {
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: null,
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('renders the main menu view when active', () => {
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: ['Use mouse to aim', 'Click to launch'],
                scores: [],
                theme: 'default',
            },
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const overlay = container.querySelector('.main-menu-overlay');
        expect(overlay).toBeTruthy();
        expect(within(container).getByText('Lucky Break')).toBeTruthy();
        expect(within(container).getByText('Press Start')).toBeTruthy();
    });

    it('calls onStart when start button is clicked', async () => {
        const mockStart = vi.fn().mockResolvedValue(undefined);
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: mockStart,
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });
        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('shows pending state while starting', async () => {
        let resolvePending: () => void;
        const mockStart = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePending = resolve;
                }),
        );

        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: mockStart,
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });

        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(startButton.hasAttribute('disabled')).toBe(true);

        await act(async () => {
            resolvePending!();
            await Promise.resolve();
        });

        expect(startButton.hasAttribute('disabled')).toBe(false);
    });

    it('handles start errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const mockStart = vi.fn().mockRejectedValue(new Error('Start failed'));

        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: mockStart,
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });
        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start from main menu', expect.any(Error));
        expect(startButton.hasAttribute('disabled')).toBe(false);

        consoleErrorSpy.mockRestore();
    });

    it('calls onToggleTheme when theme button is clicked', () => {
        const mockToggleTheme = vi.fn();
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: mockToggleTheme,
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const themeButton = within(container).getByRole('button', { name: /theme/i });
        act(() => {
            themeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(mockToggleTheme).toHaveBeenCalledTimes(1);
    });

    it('applies theme CSS properties', () => {
        vi.mocked(useMainMenuUi).mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: {
                title: 'Lucky Break',
                prompt: 'Press Start',
                prologue: null,
                helpLines: [],
                scores: [],
                theme: 'default',
            },
            onStart: vi.fn(),
            onTogglePerformance: vi.fn(),
            onOpenLedger: vi.fn(),
            onToggleTheme: vi.fn(),
            onShowStory: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(MainMenuApp)));
        });

        const overlay = container.querySelector('.main-menu-overlay')!;
        const computedStyle = window.getComputedStyle(overlay);

        expect(computedStyle.getPropertyValue('--main-menu-bg-from')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--main-menu-panel-fill')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--main-menu-text-primary')).toBeTruthy();
    });
});
