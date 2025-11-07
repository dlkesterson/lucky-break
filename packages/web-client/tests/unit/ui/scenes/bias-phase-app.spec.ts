import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BiasPhaseSceneOption, BiasPhasePayload, BiasPhaseSessionSummary } from 'scenes/bias-phase';

const themeMock = {
    background: { from: '#101020', to: '#1a1a2f' },
    hud: {
        panelFill: '#222235',
        panelLine: '#34345a',
        textPrimary: '#ffeedd',
        textSecondary: '#d4bcff',
        danger: '#ff4455',
    },
    accents: {
        combo: '#ffd45c',
        powerUp: '#ff7b33',
        danger: '#ff3355',
    },
} as const;

interface BiasPhaseUiStateMock {
    visible: boolean;
    suspended: boolean;
    payload: BiasPhasePayload | null;
}

let biasPhaseState: BiasPhaseUiStateMock = {
    visible: false,
    suspended: false,
    payload: null,
};

let BiasPhaseAppComponent: typeof import('ui/scenes/BiasPhaseApp')['BiasPhaseApp'];

const describeButton = (value: string | RegExp): string => (typeof value === 'string' ? value : value.source);

const getButton = (queries: ReturnType<typeof within>, name: string | RegExp): HTMLButtonElement => {
    const element = queries.getByRole('button', { name });
    if (!(element instanceof HTMLButtonElement)) {
        throw new Error(`Expected button element for label ${describeButton(name)}`);
    }
    return element;
};

vi.mock('ui/hooks/useGameTheme', () => ({
    useGameTheme: () => ({ theme: themeMock }),
}));

vi.mock('ui/state/bias-phase-bridge', () => ({
    useBiasPhaseUi: () => biasPhaseState,
}));

describe('BiasPhaseApp', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeAll(async () => {
        ({ BiasPhaseApp: BiasPhaseAppComponent } = await import('ui/scenes/BiasPhaseApp'));
    });

    const createSession = (overrides: Partial<BiasPhaseSessionSummary> = {}): BiasPhaseSessionSummary => ({
        nextLevel: 2,
        score: 4200,
        coins: 18,
        lives: 3,
        highestCombo: 9,
        entropyDelta: 3,
        gravity: 1.1,
        gravityDelta: 0.05,
        speedGovernor: 1.2,
        speedDelta: 0.08,
        coinsRuleLocked: false,
        seed: 12345,
        entropyStored: 10,
        ...overrides,
    });

    const createOption = (overrides: Partial<BiasPhaseSceneOption> = {}): BiasPhaseSceneOption => ({
        id: 'option-a',
        label: 'Measured Tilt Table',
        description: 'Lean into gentler odds.',
        risk: 'tilt',
        wager: {
            label: 'Wager 3 entropy',
            cost: 3,
            action: 'casino-tilt',
        },
        effectSummary: ['Gravity +0.02', 'Paddle Width ×1.10'],
        affordable: true,
        ...overrides,
    });

    const renderApp = async () => {
        await act(async () => {
            root.render(createElement(BiasPhaseAppComponent));
        });
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        biasPhaseState = {
            visible: true,
            suspended: false,
            payload: null,
        };
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('does not render when the overlay is hidden', async () => {
        biasPhaseState = {
            visible: false,
            suspended: false,
            payload: null,
        };

        await renderApp();

        expect(container.innerHTML).toBe('');
    });

    it('allows selecting and committing an option', async () => {
        const onSelect = vi.fn().mockResolvedValue(undefined);
        const onSkip = vi.fn().mockResolvedValue(undefined);
        biasPhaseState = {
            visible: true,
            suspended: false,
            payload: {
                session: createSession({ entropyStored: 12 }),
                options: [
                    createOption({ id: 'option-a' }),
                    createOption({ id: 'option-b', label: 'Nebular Drift Table', risk: 'reforge' }),
                ],
                onSelect,
                onSkip,
            },
        };

        await renderApp();

        const screen = within(container);
        screen.getByRole('heading', { name: /Luck Architect/i });
        const optionButton = getButton(screen, /Nebular Drift Table/i);
        const commitButton = getButton(screen, /Commit Selection/i);
        expect(commitButton.disabled).toBe(true);

        await act(async () => {
            fireEvent.click(optionButton);
        });

        const commitSelectedButton = getButton(screen, /Commit Nebular Drift Table/i);
        expect(commitSelectedButton.disabled).toBe(false);

        await act(async () => {
            fireEvent.click(commitSelectedButton);
        });

        expect(onSelect).toHaveBeenCalledWith('option-b');
        const committingButton = getButton(screen, /Committing/i);
        expect(committingButton.disabled).toBe(true);
        const skipButton = getButton(screen, /Hold for default path/i);
        expect(skipButton.disabled).toBe(true);
        expect(onSkip).not.toHaveBeenCalled();
    });

    it('allows skipping without committing', async () => {
        const onSkip = vi.fn().mockResolvedValue(undefined);
        biasPhaseState = {
            visible: true,
            suspended: false,
            payload: {
                session: createSession({ entropyStored: 6 }),
                options: [createOption({ id: 'option-a' })],
                onSelect: vi.fn(),
                onSkip,
            },
        };

        await renderApp();

        const screen = within(container);
        const skipButton = getButton(screen, /Hold for default path/i);

        await act(async () => {
            fireEvent.click(skipButton);
        });

        expect(onSkip).toHaveBeenCalledTimes(1);
        expect(skipButton.disabled).toBe(true);
    });

    it('resets selection when payload changes and surfaces entropy shortfall', async () => {
        const onSelect = vi.fn().mockResolvedValue(undefined);
        biasPhaseState = {
            visible: true,
            suspended: false,
            payload: {
                session: createSession({ entropyStored: 12 }),
                options: [createOption({ id: 'option-a' })],
                onSelect,
                onSkip: undefined,
            },
        };

        await renderApp();

        const screen = within(container);
        await act(async () => {
            fireEvent.click(getButton(screen, /Measured Tilt Table/i));
        });

        const commitMeasured = getButton(screen, /Commit Measured Tilt Table/i);
        expect(commitMeasured.disabled).toBe(false);

        biasPhaseState = {
            ...biasPhaseState,
            payload: {
                session: createSession({ entropyStored: 2 }),
                options: [
                    createOption({
                        id: 'option-c',
                        label: 'Vault Lock Table',
                        risk: 'lock',
                        wager: { label: 'Wager 5 entropy', cost: 5, action: 'casino-lock' },
                    }),
                ],
                onSelect,
                onSkip: undefined,
            },
        };

        await renderApp();

        const commitButton = getButton(screen, /Commit Selection/i);
        expect(commitButton.disabled).toBe(true);

        await act(async () => {
            fireEvent.click(getButton(screen, /Vault Lock Table/i));
        });

        const shortfallButton = getButton(screen, /Need 3 more entropy/i);
        expect(shortfallButton.disabled).toBe(true);
    });

    it('recovers when skip action fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onSkip = vi.fn().mockRejectedValue(new Error('nope'));
        biasPhaseState = {
            visible: true,
            suspended: false,
            payload: {
                session: createSession(),
                options: [createOption()],
                onSelect: vi.fn().mockResolvedValue(undefined),
                onSkip,
            },
        };

        await renderApp();

        const screen = within(container);
        const skipButton = getButton(screen, /Hold for default path/i);

        await act(async () => {
            fireEvent.click(skipButton);
        });

        expect(onSkip).toHaveBeenCalledTimes(1);
        expect(skipButton.disabled).toBe(false);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
