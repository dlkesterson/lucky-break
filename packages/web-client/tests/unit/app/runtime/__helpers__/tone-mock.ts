import { vi, type Mock } from 'vitest';

type ContextState = 'suspended' | 'running';
type TransportState = 'stopped' | 'started';

type MaybePromise = PromiseLike<unknown> | undefined;

export interface ToneMockState {
    contextState: ContextState;
    transportState: TransportState;
    resumeImpl: () => MaybePromise;
    startImpl: () => MaybePromise;
    resumeMock: Mock;
    transportStartMock: Mock;
    startMock: Mock;
}

export interface MockTonePlayer {
    playbackRate: number;
    volume: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
}

export const toneState: ToneMockState = {
    contextState: 'suspended',
    transportState: 'stopped',
    resumeImpl: () => {
        toneState.contextState = 'running';
        return Promise.resolve();
    },
    startImpl: () => {
        toneState.transportState = 'started';
        return Promise.resolve();
    },
    resumeMock: vi.fn(),
    transportStartMock: vi.fn(),
    startMock: vi.fn(() => Promise.resolve()),
};

const createReplayablePromise = (result: MaybePromise, onFulfilled: () => void): MaybePromise => {
    if (result && typeof result.then === 'function') {
        return Promise.resolve(result).finally(onFulfilled);
    }
    onFulfilled();
    return result;
};

export function installToneMock() {
    const resumeMock = vi.fn(() =>
        createReplayablePromise(toneState.resumeImpl(), () => {
            toneState.contextState = 'running';
        }),
    );
    const transportStartMock = vi.fn(() =>
        createReplayablePromise(toneState.startImpl(), () => {
            toneState.transportState = 'started';
        }),
    );
    const toneStartMock = vi.fn(() => Promise.resolve());

    toneState.resumeMock = resumeMock;
    toneState.transportStartMock = transportStartMock;
    toneState.startMock = toneStartMock;

    class MockGain {
        public readonly gain = {
            value: 0,
            cancelAndHoldAtTime: vi.fn(),
            setValueAtTime: vi.fn(),
            getValueAtTime: vi.fn(() => 0),
            linearRampToValueAtTime: vi.fn(),
        };
        connect = vi.fn();
        toDestination = vi.fn();
        dispose = vi.fn();
    }

    class MockPlayer {
        constructor(options: unknown) {
            void options;
        }
        sync() {
            return this;
        }
        start = vi.fn();
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockVolume {
        constructor(value: number) {
            void value;
        }
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockPanner {
        constructor(value: number) {
            void value;
        }
        connect = vi.fn();
        toDestination = vi.fn();
        pan = {
            setValueAtTime: vi.fn(),
        };
        dispose = vi.fn();
    }

    class MockPlayers {
        public readonly players: Record<string, MockTonePlayer>;
        constructor(urls: Record<string, string>, onload?: () => void) {
            this.players = Object.keys(urls).reduce<Record<string, MockTonePlayer>>((acc, id) => {
                acc[id] = {
                    playbackRate: 1,
                    volume: { value: 0 },
                    start: vi.fn(),
                    stop: vi.fn(),
                };
                return acc;
            }, {});
            if (onload) {
                queueMicrotask(onload);
            }
        }
        connect = vi.fn();
        dispose = vi.fn();
        player = vi.fn((id: string): MockTonePlayer | undefined => this.players[id]);
    }

    const transport = {
        get state() {
            return toneState.transportState;
        },
        start: transportStartMock,
    };

    return {
        Gain: MockGain,
        Player: MockPlayer,
        Transport: transport,
        getTransport: () => transport,
        getContext: () => ({
            rawContext: {
                get state() {
                    return toneState.contextState;
                },
                resume: resumeMock,
            },
        }),
        now: vi.fn(() => 0),
        Volume: MockVolume,
        Panner: MockPanner,
        Players: MockPlayers,
        start: toneStartMock,
    };
}

export const resetToneState = () => {
    toneState.contextState = 'suspended';
    toneState.transportState = 'stopped';
    toneState.resumeImpl = () => {
        toneState.contextState = 'running';
        return Promise.resolve();
    };
    toneState.startImpl = () => {
        toneState.transportState = 'started';
        return Promise.resolve();
    };
    toneState.resumeMock?.mockClear();
    toneState.transportStartMock?.mockClear();
    toneState.startMock?.mockClear();
};

vi.mock('tone', installToneMock);
