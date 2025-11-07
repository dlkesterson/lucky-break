import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GameOverUiSnapshot } from 'ui/state/game-over-bridge';

interface GameOverUiStateLike {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: GameOverUiSnapshot | null;
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

const stagePointerBlockerMock = vi.fn();
let gameOverState: GameOverUiStateLike = { visible: false, suspended: false, snapshot: null };

vi.mock('ui/hooks/useGameTheme', () => ({
    useGameTheme: () => ({ theme: themeStub }),
}));

vi.mock('ui/hooks/useStagePointerBlocker', () => ({
    useStagePointerBlocker: stagePointerBlockerMock,
}));

vi.mock('ui/state/game-over-bridge', () => ({
    useGameOverUi: () => gameOverState,
}));

const createSnapshot = (overrides: Partial<GameOverUiSnapshot> = {}): GameOverUiSnapshot => ({
    score: 1234,
    title: 'Game Over',
    prompt: 'Play Again',
    scoreLabel: 'Score 1,234',
    achievements: [],
    dustAwarded: 0,
    onRestart: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

describe('GameOverApp', () => {
    let GameOverAppComponent: typeof import('ui/scenes/GameOverApp')['GameOverApp'];
    let container: HTMLDivElement;
    let root: Root;

    const renderGameOver = async () => {
        await act(async () => {
            root.render(createElement(GameOverAppComponent));
        });
    };

    beforeAll(async () => {
        ({ GameOverApp: GameOverAppComponent } = await import('ui/scenes/GameOverApp'));
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        stagePointerBlockerMock.mockClear();
        gameOverState = { visible: false, suspended: false, snapshot: null };
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('returns null when the overlay is not active', async () => {
        await renderGameOver();
        expect(container.innerHTML).toBe('');

        gameOverState = { visible: true, suspended: true, snapshot: createSnapshot() };
        await renderGameOver();
        expect(container.innerHTML).toBe('');

        gameOverState = { visible: true, suspended: false, snapshot: null };
        await renderGameOver();
        expect(container.innerHTML).toBe('');
    });

    it('renders the game-over summary and achievements when active', async () => {
        const achievements = [
            { id: 'ace', title: 'Ace Pilot', description: 'Defeat the house.' },
            { id: 'lucky', title: 'Lucky Break', description: 'Survive with 1 life.' },
        ];

        gameOverState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({
                score: 987654,
                scoreLabel: 'Score 987,654',
                dustAwarded: 4200,
                achievements,
            }),
        };

        await renderGameOver();

        const screen = within(container);
        screen.getByRole('heading', { name: 'Game Over' });
        screen.getByText('Score 987,654');
        screen.getByText(Number(987654).toLocaleString());
        screen.getByText(Number(4200).toLocaleString());
        screen.getByText('Achievements Unlocked');
        screen.getByText(achievements[0]?.title ?? '');
        screen.getByText(achievements[1]?.description ?? '');

        expect(stagePointerBlockerMock).toHaveBeenCalled();
        const [activeFlag, resolver] = stagePointerBlockerMock.mock.calls.at(-1) ?? [];
        expect(activeFlag).toBe(true);
        expect(typeof resolver).toBe('function');
        expect(resolver?.()).toBe(document);
    });

    it('handles restart attempts, pending states, and reset on visibility change', async () => {
        const restartMock = vi
            .fn<[], Promise<void>>()
            .mockRejectedValueOnce(new Error('nope'))
            .mockResolvedValueOnce(undefined);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

        gameOverState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onRestart: restartMock }),
        };

        await renderGameOver();

        let screen = within(container);
        let button = screen.getByRole('button', { name: 'Play Again' });

        await act(async () => {
            fireEvent.click(button);
        });
        expect(restartMock).toHaveBeenCalledTimes(1);
        expect(button.textContent).toContain('Play Again');
        expect(button.hasAttribute('disabled')).toBe(false);

        consoleError.mockRestore();

        gameOverState = {
            visible: true,
            suspended: false,
            snapshot: createSnapshot({ onRestart: restartMock }),
        };
        await renderGameOver();

        screen = within(container);
        button = screen.getByRole('button', { name: 'Play Again' });

        await act(async () => {
            fireEvent.click(button);
        });
        expect(button.textContent).toContain('Returning…');
        expect(button.hasAttribute('disabled')).toBe(true);

        gameOverState = {
            visible: false,
            suspended: false,
            snapshot: gameOverState.snapshot,
        };
        await renderGameOver();

        gameOverState = {
            visible: true,
            suspended: false,
            snapshot: gameOverState.snapshot,
        };
        await renderGameOver();

        screen = within(container);
        const resetButton = screen.getByRole('button', { name: 'Play Again' });
        expect(resetButton).not.toBeNull();
        expect(resetButton.hasAttribute('disabled')).toBe(false);
        expect(resetButton.textContent).toContain('Play Again');
    });
});
