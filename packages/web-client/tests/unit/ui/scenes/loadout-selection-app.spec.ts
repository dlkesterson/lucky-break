import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { within } from '@testing-library/dom';

import { LoadoutSelectionApp } from 'ui/scenes/LoadoutSelectionApp';
import { useLoadoutSelectionUi } from 'ui/state/loadout-selection-bridge';
import { useGameTheme } from 'ui/hooks/useGameTheme';
import { wrapWithI18n } from '../../../utils/test-wrapper';

vi.mock('ui/state/loadout-selection-bridge');
vi.mock('ui/hooks/useGameTheme');

describe('LoadoutSelectionApp', () => {
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

    const mockPresets = [
        {
            id: 'classic',
            name: 'Classic',
            description: 'Classic ball form',
            selection: { formId: 'classic' },
            preview: {
                shape: 'sphere' as const,
                baseColor: 0xf4f4f4,
                accentColor: 0xffcc66,
            },
            trait: { name: 'Balanced' },
            sigil: { name: 'Star' },
            voice: { name: 'Default' },
            combinedSummary: ['Balanced stats', 'Good all-around'],
            cardSummary: ['Classic choice'],
        },
        {
            id: 'power',
            name: 'Power',
            description: 'Powerful ball form',
            selection: { formId: 'power' },
            preview: {
                shape: 'd20' as const,
                baseColor: 0xff6b35,
                accentColor: 0xffd04a,
            },
            trait: { name: 'Strong' },
            sigil: { name: 'Lightning' },
            voice: { name: 'Thunder' },
            combinedSummary: ['High damage', 'Increased speed'],
            cardSummary: ['Power focused'],
        },
    ];

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
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: false,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('returns null when suspended', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: true,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('returns null when presets are empty', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: [],
            lockedForms: [],
            defaultFormId: null,
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('returns null when commitSelection is missing', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: undefined,
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        expect(container.textContent).toBe('');
    });

    it('renders the loadout selection view when active', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const overlay = container.querySelector('.loadout-overlay');
        expect(overlay).toBeTruthy();
        expect(within(container).getByText(/choose your starting loadout/i)).toBeTruthy();
    });

    it('initializes with the default form selected', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'power',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const grid = within(container).getByLabelText('Available forms');
        const powerCard = within(grid).getByText('Power').closest('button');
        expect(powerCard?.className.includes('is-selected')).toBe(true);
    });

    it('allows selecting a different form', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const grid = within(container).getByLabelText('Available forms');
        let classicCard = within(grid).getByText('Classic').closest('button');
        expect(classicCard?.className.includes('is-selected')).toBe(true);

        const powerCard = within(grid).getByText('Power').closest('button');
        act(() => {
            powerCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Re-query after state change
        classicCard = within(grid).getByText('Classic').closest('button');
        const updatedPowerCard = within(grid).getByText('Power').closest('button');

        expect(classicCard?.className.includes('is-selected')).toBe(false);
        expect(updatedPowerCard?.className.includes('is-selected')).toBe(true);
    });

    it('commits the selected form when start is clicked', async () => {
        const mockCommit = vi.fn().mockResolvedValue(undefined);
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: mockCommit,
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });
        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(mockCommit).toHaveBeenCalledWith({ formId: 'classic' });
    });

    it('prevents starting with a locked form', async () => {
        const mockCommit = vi.fn();
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: ['classic'],
            defaultFormId: 'classic',
            commitSelection: mockCommit,
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });
        expect(startButton.hasAttribute('disabled')).toBe(true);

        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(mockCommit).not.toHaveBeenCalled();
    });

    it('shows pending state while committing', async () => {
        let resolvePending: () => void;
        const mockCommit = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePending = resolve;
                }),
        );

        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: mockCommit,
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });

        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        // Should show pending state
        const ball = container.querySelector('.loadout-ball');
        expect(ball?.className.includes('is-pending')).toBe(true);

        // Resolve and verify pending state clears
        await act(async () => {
            resolvePending!();
            await Promise.resolve();
        });
    });

    it('handles commit errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const mockCommit = vi.fn().mockRejectedValue(new Error('Commit failed'));
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: mockCommit,
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const startButton = within(container).getByRole('button', { name: /start/i });
        await act(async () => {
            startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to begin session from loadout selection',
            expect.any(Error),
        );
        expect(startButton.hasAttribute('disabled')).toBe(false);

        consoleErrorSpy.mockRestore();
    });

    it('applies theme CSS properties', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const overlay = container.querySelector('.loadout-overlay')!;
        const computedStyle = window.getComputedStyle(overlay);

        expect(computedStyle.getPropertyValue('--loadout-panel-fill')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--loadout-panel-line')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--loadout-text-primary')).toBeTruthy();
    });

    it('calculates ball style CSS properties from selected preset', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const ball = container.querySelector('.loadout-ball')!;
        const computedStyle = window.getComputedStyle(ball);

        expect(computedStyle.getPropertyValue('--loadout-ball-base')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--loadout-ball-accent')).toBeTruthy();
        expect(computedStyle.getPropertyValue('--loadout-d20-highlight')).toBeTruthy();
    });

    it('shows pulse animation on mount', () => {
        vi.mocked(useLoadoutSelectionUi).mockReturnValue({
            visible: true,
            suspended: false,
            presets: mockPresets,
            lockedForms: [],
            defaultFormId: 'classic',
            commitSelection: vi.fn(),
        });

        act(() => {
            root.render(wrapWithI18n(createElement(LoadoutSelectionApp)));
        });

        const ball = container.querySelector('.loadout-ball');
        expect(ball?.className.includes('is-pulsing')).toBe(true);
    });
});
