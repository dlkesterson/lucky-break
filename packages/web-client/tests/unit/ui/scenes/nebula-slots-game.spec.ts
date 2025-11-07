import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { act, createElement } from 'react';
import { fireEvent, within } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { NebulaSlotsGame, type NebulaSlotsGameProps } from 'ui/scenes/casino-hub/NebulaSlotsGame';
import type { NebulaSlotSymbol } from 'app/runtime/casino-games';
import type { NebulaSlotsSpinResult } from 'scenes/bias-phase';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SYMBOL_TO_EMOJI: Record<NebulaSlotSymbol, string> = {
    STAR: '⭐️',
    '777': '7️⃣',
    TILT: '🎯',
    LOCK: '🔒',
    LUCK: '🍀',
    VOID: '🪐',
    GLIM: '✨',
};

describe('NebulaSlotsGame', () => {
    let container: HTMLDivElement;
    let root: Root;
    let performanceNowSpy: MockInstance<[], number> | null;

    const getButton = (queries: ReturnType<typeof within>, name: string | RegExp): HTMLButtonElement => {
        const element = queries.getByRole('button', { name });
        if (!(element instanceof HTMLButtonElement)) {
            throw new Error(`Expected button element for label ${typeof name === 'string' ? name : name.source}`);
        }
        return element;
    };

    const baseProps: Omit<NebulaSlotsGameProps, 'onSpin' | 'onResult'> = {
        entropy: 12,
        seed: 12345,
        accentColor: '#ffd26e',
        spinCost: 2,
        disabled: false,
    };

    const renderGame = async (
        props: Pick<NebulaSlotsGameProps, 'onSpin' | 'onResult'> & Partial<Omit<NebulaSlotsGameProps, 'onSpin' | 'onResult'>>,
    ) => {
        const merged: NebulaSlotsGameProps = {
            ...baseProps,
            ...props,
            onForceAdvance: props.onForceAdvance ?? null,
        };

        await act(async () => {
            root.render(createElement(NebulaSlotsGame, merged));
        });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => 42);
    });

    afterEach(() => {
        vi.useRealTimers();
        performanceNowSpy?.mockRestore();
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('resets after the full spin cycle and highlights the resolved symbols', async () => {
        const resolvedResult: NebulaSlotsSpinResult = {
            spinIndex: 7,
            symbols: ['777', '777', '777'],
            rarity: 'jackpot',
            headline: 'Test Jackpot',
            detail: 'Jackpot detail',
            biasRisk: 'reforge',
            wildcard: true,
            entropyRemaining: 6,
        } as const;

        const onSpin = vi.fn().mockResolvedValue(resolvedResult);
        const onResult = vi.fn();

        await renderGame({ onSpin, onResult });

        const screen = within(container);
        const spinButton = getButton(screen, /Spin Nebula Slots/i);

        await act(async () => {
            fireEvent.click(spinButton);
        });

        expect(onSpin).toHaveBeenCalledTimes(1);
        const spinningButton = getButton(screen, /Spinning/i);
        expect(spinningButton.disabled).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(7000);
        });

        expect(onResult).toHaveBeenCalledTimes(1);
        expect(onResult).toHaveBeenCalledWith(resolvedResult);

        const readyButton = getButton(screen, /Spin Nebula Slots/i);
        expect(readyButton.disabled).toBe(false);

        const reels = container.querySelectorAll('[role="presentation"]');
        expect(reels).toHaveLength(3);

        resolvedResult.symbols.forEach((symbol, index) => {
            const reel = reels[index];
            expect(reel).toBeInstanceOf(HTMLElement);
            const highlight = reel?.querySelector('.scale-110');
            expect(highlight).not.toBeNull();
            const textContent = highlight?.textContent ?? '';
            expect(textContent).toContain(SYMBOL_TO_EMOJI[symbol]);
        });
    });
});
