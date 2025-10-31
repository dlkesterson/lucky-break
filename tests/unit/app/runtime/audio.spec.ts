import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { toneState, resetToneState } from './__helpers__/tone-mock';

import {
    ensureToneAudio,
    isAutoplayBlockedError,
    isPromiseLike,
    resolveToneTransport,
    waitForPromise,
} from 'app/runtime/audio';

const expectPromise = (value: unknown) => {
    expect(isPromiseLike(value)).toBe(true);
};

describe('runtime audio helpers', () => {
    beforeEach(() => {
        resetToneState();
    });

    it('identifies promise-like values correctly', () => {
        expectPromise({ then: () => undefined });
        expectPromise(Promise.resolve('value'));
    });

    it('rejects non promise-like values', () => {
        expect(isPromiseLike(null)).toBe(false);
        expect(isPromiseLike({})).toBe(false);
        expect(isPromiseLike({ then: 42 })).toBe(false);
    });

    it('waits for promises that settle before the timeout', async () => {
        await expect(waitForPromise(Promise.resolve('ok'), 10)).resolves.toBeUndefined();
    });

    it('times out safely when the promise never settles', async () => {
        vi.useFakeTimers();
        try {
            const pending = new Promise<void>(() => undefined);
            const waitTask = waitForPromise(pending, 5);
            await vi.advanceTimersByTimeAsync(6);
            await expect(waitTask).resolves.toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });

    it('propagates promise rejections without swallowing errors', async () => {
        const failure = new Error('wait failed');
        await expect(waitForPromise(Promise.reject(failure), 10)).rejects.toBe(failure);
    });

    it('detects autoplay blocking errors', () => {
        const named = new Error('blocked');
        named.name = 'NotAllowedError';
        expect(isAutoplayBlockedError(named)).toBe(true);

        const messageMatch = new Error('Audio playback was not allowed to start');
        expect(isAutoplayBlockedError(messageMatch)).toBe(true);

        expect(isAutoplayBlockedError(new Error('Other failure'))).toBe(false);
        expect(isAutoplayBlockedError('not an error')).toBe(false);
    });

    it('uses Tone transport when available and falls back on failure', async () => {
        const toneModule = await import('tone');
        expect(resolveToneTransport()).toBe(toneModule.getTransport());

        const originalGetTransport = toneModule.getTransport;
        (toneModule as { getTransport: () => unknown }).getTransport = () => {
            throw new Error('unavailable');
        };
        try {
            expect(resolveToneTransport()).toBe(toneModule.Transport);
        } finally {
            (toneModule as { getTransport: () => unknown }).getTransport = originalGetTransport;
        }
    });

    it('resumes audio context and starts transport when needed', async () => {
        await ensureToneAudio();

        expect(toneState.resumeMock).toHaveBeenCalledTimes(1);
        expect(toneState.transportStartMock).toHaveBeenCalledTimes(1);
        expect(toneState.contextState).toBe('running');
        expect(toneState.transportState).toBe('started');
    });

    it('skips resume and start when audio is already active', async () => {
        toneState.contextState = 'running';
        toneState.transportState = 'started';

        await ensureToneAudio();

        expect(toneState.resumeMock).not.toHaveBeenCalled();
        expect(toneState.transportStartMock).not.toHaveBeenCalled();
    });

    it('bubbles autoplay blocks originating from Tone.start', async () => {
        const blocked = new Error('autoplay');
        blocked.name = 'NotAllowedError';
        const toneModule = await import('tone');
        const startMock = toneModule.start as Mock;
        startMock.mockImplementationOnce(() => Promise.reject(blocked));

        await expect(ensureToneAudio()).rejects.toBe(blocked);
    });

    it('bubbles autoplay blocks originating from AudioContext.resume', async () => {
        const blocked = new Error('context blocked');
        blocked.name = 'NotAllowedError';
        toneState.resumeImpl = () => Promise.reject(blocked);

        await expect(ensureToneAudio()).rejects.toBe(blocked);

        toneState.resumeImpl = () => Promise.resolve();
    });

    it('bubbles autoplay blocks originating from Tone.Transport.start', async () => {
        const blocked = new Error('transport blocked');
        blocked.name = 'NotAllowedError';
        toneState.startImpl = () => Promise.reject(blocked);

        await expect(ensureToneAudio()).rejects.toBe(blocked);
    });

    it('logs and rethrows unexpected Tone.Transport.start errors', async () => {
        const unexpected = new Error('transport failed');
        toneState.startImpl = () => Promise.reject(unexpected);
        const warn = vi.fn();

        await expect(ensureToneAudio({ warn })).rejects.toBe(unexpected);
        expect(warn).toHaveBeenCalledWith('Tone.Transport.start failed', { error: unexpected });
    });

    it('logs and rethrows unexpected Tone.start errors', async () => {
        const toneModule = await import('tone');
        const failure = new Error('tone start failed');
        (toneModule.start as Mock).mockImplementationOnce(() => Promise.reject(failure));
        const warn = vi.fn();

        await expect(ensureToneAudio({ warn })).rejects.toBe(failure);
        expect(warn).toHaveBeenCalledWith('Tone.start failed', { error: failure });
    });

    it('logs and rethrows unexpected AudioContext.resume errors', async () => {
        const failure = new Error('resume failed');
        toneState.resumeImpl = () => Promise.reject(failure);
        const warn = vi.fn();

        await expect(ensureToneAudio({ warn })).rejects.toBe(failure);
        expect(warn).toHaveBeenCalledWith('AudioContext.resume failed', { error: failure });

        toneState.resumeImpl = () => Promise.resolve();
    });
});
