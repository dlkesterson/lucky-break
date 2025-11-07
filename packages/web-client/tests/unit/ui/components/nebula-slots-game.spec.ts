import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NebulaSlotsSpinResult } from 'scenes/bias-phase';
import type { NebulaSlotsGameProps } from 'ui/scenes/casino-hub/NebulaSlotsGame';

const defaultSpinResult: NebulaSlotsSpinResult = {
    spinIndex: 1,
    symbols: ['TILT', 'TILT', 'TILT'] as const,
    rarity: 'bias',
    headline: 'Bias Forecast',
    detail: 'Tilt favors the brave.',
    biasRisk: 'tilt',
    wildcard: false,
    entropyRemaining: 6,
};

const createProps = (overrides: Partial<NebulaSlotsGameProps> = {}): NebulaSlotsGameProps => ({
    entropy: 10,
    seed: 42,
    accentColor: '#ff7b33',
    spinCost: 2,
    disabled: false,
    onSpin: vi.fn().mockResolvedValue(defaultSpinResult),
    onResult: vi.fn(),
    onForceAdvance: null,
    forceAdvanceLabel: undefined,
    forceAdvanceMessage: undefined,
    ...overrides,
});

let NebulaSlotsGameComponent: typeof import('ui/scenes/casino-hub/NebulaSlotsGame')['NebulaSlotsGame'];

const getButton = (queries: ReturnType<typeof within>, label: string | RegExp) => {
    const element = queries.getByRole('button', { name: label });
    if (!(element instanceof HTMLButtonElement)) {
        throw new Error(`Expected button element for label ${typeof label === 'string' ? label : label.source}`);
    }
    return element;
};

describe('NebulaSlotsGame', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderGame = async (props: Parameters<typeof NebulaSlotsGameComponent>[0]) => {
        await act(async () => {
            root.render(createElement(NebulaSlotsGameComponent, props));
        });
    };

    beforeAll(async () => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        ({ NebulaSlotsGame: NebulaSlotsGameComponent } = await import('ui/scenes/casino-hub/NebulaSlotsGame'));
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('spins the reels, reveals the result, and forwards the outcome', async () => {
        vi.useFakeTimers();
        const props = createProps();

        await renderGame(props);

        const screen = within(container);
        const spinButton = getButton(screen, /Spin Nebula Slots/i);
        expect(spinButton.disabled).toBe(false);

        await act(async () => {
            fireEvent.click(spinButton);
            await vi.advanceTimersByTimeAsync(4000);
        });

        expect(props.onSpin).toHaveBeenCalledTimes(1);
        expect(props.onResult).toHaveBeenCalledWith(defaultSpinResult);

        await act(async () => {
            await Promise.resolve();
        });
        screen.getByText(/Bias Forecast/i);
        expect(getButton(screen, /Spin Nebula Slots/i).disabled).toBe(false);
    });

    it('surfaces errors from the spin handler and re-enables controls', async () => {
        const props = createProps({
            onSpin: vi.fn().mockRejectedValue('Nebula slots jammed'),
        });

        await renderGame(props);

        const screen = within(container);
        const spinButton = getButton(screen, /Spin Nebula Slots/i);

        await act(async () => {
            fireEvent.click(spinButton);
            await Promise.resolve();
            await Promise.resolve();
        });

        await act(async () => {
            await Promise.resolve();
        });
        const errorMessages = screen.getAllByText(/Nebula slots jammed/i);
        expect(errorMessages.length).toBeGreaterThan(0);
        expect(getButton(screen, /Spin Nebula Slots/i).disabled).toBe(false);
        expect(props.onResult).not.toHaveBeenCalled();
    });

    it('exposes the force-advance action when provided', async () => {
        const onForceAdvance = vi.fn();
        const props = createProps({ onForceAdvance, forceAdvanceLabel: 'Skip Slots' });

        await renderGame(props);

        const screen = within(container);
        const skipButton = getButton(screen, /Skip Slots/i);
        expect(skipButton.disabled).toBe(false);

        await act(async () => {
            fireEvent.click(skipButton);
        });

        expect(onForceAdvance).toHaveBeenCalledTimes(1);
    });
});
