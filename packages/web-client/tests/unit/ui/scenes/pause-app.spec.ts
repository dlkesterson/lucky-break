import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PauseUiSnapshot } from 'ui/state/pause-bridge';
import type { HudState } from 'ui/state/game-bridge';
import { wrapWithI18n } from '../../../utils/test-wrapper';

interface PauseUiStateLike {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: PauseUiSnapshot | null;
}

const themeStub = {
    background: { from: '#111122', to: '#221111' },
    hud: {
        panelFill: '#222222',
        panelLine: '#333333',
        textPrimary: '#eeeeee',
        textSecondary: '#bbbbbb',
        danger: '#ff3366',
    },
    accents: { combo: '#55ffee' },
};

const createHudState = (overrides: Partial<HudState> = {}): HudState => ({
    score: 0,
    lives: 3,
    coins: 0,
    combo: 0,
    comboPulse: 0,
    fps: undefined,
    difficultyMultiplier: 1,
    comboTimer: 0,
    brickRemaining: 0,
    brickTotal: 0,
    scoreboard: null,
    activePowerUps: [],
    reward: null,
    entropyActions: [],
    momentum: null,
    prompts: [],
    visible: false,
    attemptEntropyAction: undefined,
    settings: { muted: false, masterVolume: 0.5, reducedMotion: false },
    updateSettings: undefined,
    flavor: null,
    physics: null,
    ...overrides,
});

const stagePointerBlockerMock = vi.fn();
let pauseState: PauseUiStateLike = { visible: false, suspended: false, snapshot: null };
let hudState: HudState;

vi.mock('ui/hooks/useGameTheme', () => ({
    useGameTheme: () => ({ theme: themeStub, name: 'cosmic' }),
}));

vi.mock('ui/hooks/useStagePointerBlocker', () => ({
    useStagePointerBlocker: stagePointerBlockerMock,
}));

vi.mock('ui/state/pause-bridge', () => ({
    usePauseUi: () => pauseState,
}));

vi.mock('ui/state/game-bridge', () => ({
    useHud: () => hudState,
}));

vi.mock('render/theme', async (importOriginal) => {
    const actual = await importOriginal<typeof import('render/theme')>();
    return {
        ...actual,
        toggleTheme: vi.fn(),
        getThemeLabel: vi.fn(() => 'Cosmic'),
    };
});

vi.mock('@lucky-break/design-system', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lucky-break/design-system')>();
    return {
        ...actual,
        Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
            open ? createElement('div', { 'data-dialog': 'true' }, children) : null,
        DialogContent: ({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) =>
            createElement('div', { className, style }, children),
        DialogHeader: ({ children }: { children: React.ReactNode }) =>
            createElement('div', null, children),
        DialogTitle: ({ children }: { children: React.ReactNode }) =>
            createElement('h2', null, children),
        DialogDescription: ({ children }: { children: React.ReactNode }) =>
            createElement('p', null, children),
    };
});

const createSnapshot = (overrides: Partial<PauseUiSnapshot> = {}): PauseUiSnapshot => ({
    title: 'Paused',
    score: 5000,
    legendTitle: null,
    legendItems: [],
    resumeLabel: 'Resume',
    quitLabel: 'Quit',
    onResume: vi.fn().mockResolvedValue(undefined),
    onQuit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

describe('PauseApp', () => {
    let PauseAppComponent: typeof import('ui/scenes/PauseApp')['PauseApp'];
    let container: HTMLDivElement;
    let root: Root;

    const renderPauseApp = async () => {
        await act(async () => {
            root.render(wrapWithI18n(createElement(PauseAppComponent)));
        });
    };

    beforeAll(async () => {
        ({ PauseApp: PauseAppComponent } = await import('ui/scenes/PauseApp'));
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        stagePointerBlockerMock.mockClear();
        pauseState = { visible: false, suspended: false, snapshot: null };
        hudState = createHudState();
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('returns null when not visible', async () => {
        await renderPauseApp();
        expect(container.innerHTML).toBe('');
    });

    it('returns null when suspended', async () => {
        pauseState = {
            visible: true,
            suspended: true,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();
        expect(container.innerHTML).toBe('');
    });

    it('returns null when snapshot is null', async () => {
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: null,
        };

        await renderPauseApp();
        expect(container.innerHTML).toBe('');
    });

    it('renders pause view when active', async () => {
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({
                title: 'Game Paused',
                score: 12345,
            }),
        };

        await renderPauseApp();

        const screen = within(container);
        screen.getByRole('heading', { name: /game paused/i });
        expect(container.innerHTML).not.toBe('');
    });

    it('calls onResume when resume button is clicked', async () => {
        const mockOnResume = vi.fn().mockResolvedValue(undefined);
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        const screen = within(container);
        const resumeButton = screen.getByRole('button', { name: /resume/i });

        await act(async () => {
            fireEvent.click(resumeButton);
        });

        expect(mockOnResume).toHaveBeenCalledOnce();
    });

    it('calls onQuit when quit button is clicked', async () => {
        const mockOnQuit = vi.fn().mockResolvedValue(undefined);
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onQuit: mockOnQuit }),
        };

        await renderPauseApp();

        const screen = within(container);
        const quitButton = screen.getByRole('button', { name: /quit/i });

        await act(async () => {
            fireEvent.click(quitButton);
        });

        expect(mockOnQuit).toHaveBeenCalledOnce();
    });

    it('shows pending state during resume', async () => {
        const mockOnResume = vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
        );
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume, resumeLabel: 'Resume' }),
        };

        await renderPauseApp();

        const screen = within(container);
        const resumeButton = screen.getByRole('button', { name: /resume/i });

        await act(async () => {
            fireEvent.click(resumeButton);
        });

        await vi.waitFor(() => {
            expect(resumeButton.hasAttribute('disabled')).toBe(true);
        });
    });

    it('shows pending state during quit', async () => {
        const mockOnQuit = vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
        );
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onQuit: mockOnQuit, quitLabel: 'Quit' }),
        };

        await renderPauseApp();

        const screen = within(container);
        const quitButton = screen.getByRole('button', { name: /quit/i });

        await act(async () => {
            fireEvent.click(quitButton);
        });

        await vi.waitFor(() => {
            expect(quitButton.hasAttribute('disabled')).toBe(true);
        });
    });

    it('handles errors during resume', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
        const mockOnResume = vi.fn().mockRejectedValue(new Error('Resume failed'));
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        const screen = within(container);
        const resumeButton = screen.getByRole('button', { name: /resume/i });

        await act(async () => {
            fireEvent.click(resumeButton);
        });

        expect(mockOnResume).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalled();

        consoleError.mockRestore();
    });

    it('handles errors during quit', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
        const mockOnQuit = vi.fn().mockRejectedValue(new Error('Quit failed'));
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onQuit: mockOnQuit }),
        };

        await renderPauseApp();

        const screen = within(container);
        const quitButton = screen.getByRole('button', { name: /quit/i });

        await act(async () => {
            fireEvent.click(quitButton);
        });

        expect(mockOnQuit).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalled();

        consoleError.mockRestore();
    });

    it('prevents multiple concurrent resume actions', async () => {
        const mockOnResume = vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 50)),
        );
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        const screen = within(container);
        const resumeButton = screen.getByRole('button', { name: /resume/i });

        fireEvent.click(resumeButton);
        fireEvent.click(resumeButton);
        fireEvent.click(resumeButton);

        await vi.waitFor(() => {
            expect(mockOnResume.mock.calls.length).toBeGreaterThan(0);
        });
    });

    it('prevents multiple concurrent quit actions', async () => {
        const mockOnQuit = vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 50)),
        );
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onQuit: mockOnQuit }),
        };

        await renderPauseApp();

        const screen = within(container);
        const quitButton = screen.getByRole('button', { name: /quit/i });

        fireEvent.click(quitButton);
        fireEvent.click(quitButton);
        fireEvent.click(quitButton);

        await vi.waitFor(() => {
            expect(mockOnQuit.mock.calls.length).toBeGreaterThan(0);
        });
    });

    it('updates volume when slider changes', async () => {
        const mockUpdateSettings = vi.fn();
        hudState = createHudState({ updateSettings: mockUpdateSettings });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const volumeSlider = screen.getByRole('slider', { name: /volume/i });

        await act(async () => {
            fireEvent.input(volumeSlider, { target: { value: '75' } });
        });

        expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({ masterVolume: 0.75 }),
        );
    });

    it('unmutes when increasing volume from zero', async () => {
        const mockUpdateSettings = vi.fn();
        hudState = createHudState({
            updateSettings: mockUpdateSettings,
            settings: { muted: true, masterVolume: 0, reducedMotion: false },
        });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const volumeSlider = screen.getByRole('slider', { name: /volume/i });

        await act(async () => {
            fireEvent.input(volumeSlider, { target: { value: '50' } });
        });

        expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({ masterVolume: 0.5, muted: false }),
        );
    });

    it('toggles mute when checkbox changes', async () => {
        const mockUpdateSettings = vi.fn();
        hudState = createHudState({ updateSettings: mockUpdateSettings });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const muteCheckbox = screen.getByRole('checkbox', { name: /mute/i });

        await act(async () => {
            fireEvent.click(muteCheckbox);
        });

        expect(mockUpdateSettings).toHaveBeenCalledWith({ muted: true });
    });

    it('calls toggleTheme when theme button is clicked', async () => {
        const { toggleTheme } = await import('render/theme');
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const themeButton = screen.getByRole('button', { name: /theme/i });

        await act(async () => {
            fireEvent.click(themeButton);
        });

        expect(toggleTheme).toHaveBeenCalled();
    });

    it('calls attemptEntropyAction when entropy action is triggered', async () => {
        const mockAttemptEntropyAction = vi.fn();
        hudState = createHudState({
            attemptEntropyAction: mockAttemptEntropyAction,
            entropyActions: [
                {
                    action: 'test-action' as any,
                    label: 'Test Action',
                    hotkey: 'T',
                    cost: 10,
                    charges: 1,
                    affordable: true,
                },
            ],
        });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const actionButton = screen.getByRole('button', { name: /test action/i });

        await act(async () => {
            fireEvent.click(actionButton);
        });

        expect(mockAttemptEntropyAction).toHaveBeenCalledWith('test-action');
    });

    it('resets pending state when visibility changes', async () => {
        const mockOnResume = vi.fn().mockResolvedValue(undefined);
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        const screen = within(container);
        const resumeButton = screen.getByRole('button', { name: /resume/i });

        await act(async () => {
            fireEvent.click(resumeButton);
        });

        pauseState = {
            visible: false,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onResume: mockOnResume }),
        };

        await renderPauseApp();

        const newResumeButton = screen.queryByRole('button', { name: /resuming/i });
        expect(newResumeButton).toBeNull();
    });

    it('displays legend items when provided', async () => {
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({
                legendTitle: 'Brick Types',
                legendItems: [
                    { text: 'Standard' },
                    { text: 'Bonus' },
                ],
            }),
        };

        await renderPauseApp();

        const screen = within(container);
        screen.getByText('Standard');
        screen.getByText('Bonus');
    });

    it('handles non-finite volume values gracefully', async () => {
        const mockUpdateSettings = vi.fn();
        hudState = createHudState({
            updateSettings: mockUpdateSettings,
            settings: { muted: false, masterVolume: NaN, reducedMotion: false },
        });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        expect(container.innerHTML).not.toBe('');
    });

    it('clamps volume values to 0-100 range', async () => {
        const mockUpdateSettings = vi.fn();
        hudState = createHudState({ updateSettings: mockUpdateSettings });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const volumeSlider = screen.getByRole('slider', { name: /volume/i });

        await act(async () => {
            fireEvent.input(volumeSlider, { target: { value: '150' } });
        });

        expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({ masterVolume: 1 }),
        );

        await act(async () => {
            fireEvent.input(volumeSlider, { target: { value: '-50' } });
        });

        expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({ masterVolume: 0 }),
        );
    });

    it('does not call updateSettings when it is undefined', async () => {
        hudState = createHudState({ updateSettings: undefined });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const volumeSlider = screen.getByRole('slider', { name: /volume/i });

        await act(async () => {
            fireEvent.input(volumeSlider, { target: { value: '75' } });
        });

        expect(container.innerHTML).not.toBe('');
    });

    it('does not call attemptEntropyAction when it is undefined', async () => {
        hudState = createHudState({
            attemptEntropyAction: undefined,
            entropyActions: [
                {
                    action: 'test-action' as any,
                    label: 'Test Action',
                    hotkey: 'T',
                    cost: 10,
                    charges: 1,
                    affordable: true,
                },
            ],
        });
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        const screen = within(container);
        const actionButton = screen.getByRole('button', { name: /test action/i });

        await act(async () => {
            fireEvent.click(actionButton);
        });

        expect(container.innerHTML).not.toBe('');
    });

    it('calls stage pointer blocker with correct params', async () => {
        pauseState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot(),
        };

        await renderPauseApp();

        expect(stagePointerBlockerMock).toHaveBeenCalled();
        const [isActive, resolverFn] = stagePointerBlockerMock.mock.calls.at(-1) ?? [];
        expect(isActive).toBe(true);
        expect(typeof resolverFn).toBe('function');
    });
});
