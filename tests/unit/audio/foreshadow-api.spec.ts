import { afterEach, describe, expect, it, vi } from 'vitest';

const audioForeshadowerModulePath = 'audio/AudioForeshadower';

interface ConstructorCall {
    readonly scale: readonly number[];
    readonly seed: number;
}

const constructorCalls: ConstructorCall[] = [];
const scheduleEventMock = vi.fn();
const cancelEventMock = vi.fn();
const disposeMock = vi.fn();

const loadForeshadowApi = async () => {
    constructorCalls.length = 0;
    scheduleEventMock.mockReset();
    cancelEventMock.mockReset();
    disposeMock.mockReset();

    vi.resetModules();
    vi.doUnmock(audioForeshadowerModulePath);
    vi.doMock(audioForeshadowerModulePath, () => {
        class AudioForeshadowerMock {
            public readonly scheduleEvent = scheduleEventMock;
            public readonly cancelEvent = cancelEventMock;
            public readonly dispose = disposeMock;

            public constructor(scale: readonly number[], seed: number) {
                constructorCalls.push({ scale: Array.from(scale), seed });
            }
        }

        return {
            AudioForeshadower: AudioForeshadowerMock,
            PredictedEvent: {} as unknown,
        };
    });

    return import('audio/foreshadow-api');
};

afterEach(() => {
    vi.doUnmock(audioForeshadowerModulePath);
    vi.resetModules();
});

describe('foreshadow-api', () => {
    it('normalizes scale arrays and disposes previous instances when reinitializing with positional args', async () => {
        const api = await loadForeshadowApi();
        const { initForeshadower } = api;

        const first = initForeshadower([60, 61.4, Number.NaN], 42.9);
        expect(first).toBeDefined();
        expect(constructorCalls).toHaveLength(1);
        expect(constructorCalls[0]).toEqual({ scale: [60, 61], seed: 42 });
        expect(disposeMock).not.toHaveBeenCalled();

        const second = initForeshadower([], Number.POSITIVE_INFINITY);
        expect(second).toBeDefined();
        expect(constructorCalls).toHaveLength(2);
        expect(constructorCalls[1]).toEqual({ scale: [], seed: 1 });
        expect(disposeMock).toHaveBeenCalledTimes(1);
    });

    it('supports object options and proxies scheduling helpers to the active foreshadower', async () => {
        const api = await loadForeshadowApi();
        const { initForeshadower, scheduleForeshadowEvent, cancelForeshadowEvent, disposeForeshadower } = api;

        const foreshadower = initForeshadower({
            scale: [72, 73.9, Number.NaN],
            seed: 7.8,
        });
        expect(foreshadower).toBeDefined();
        expect(constructorCalls[0]).toEqual({ scale: [72, 74], seed: 7 });

        const event = { id: 'brick-1', type: 'brickHit', timeUntil: 1.5 } as const;
        scheduleForeshadowEvent(event);
        expect(scheduleEventMock).toHaveBeenCalledWith(event);

        cancelForeshadowEvent('brick-1');
        expect(cancelEventMock).toHaveBeenCalledWith('brick-1');

        disposeForeshadower();
        expect(disposeMock).toHaveBeenCalledTimes(1);
    });
});
