import { Transport, getContext, getTransport, start as toneStart } from 'tone';

type PromiseLikeValue<T> = PromiseLike<T> | { then?: unknown };

const AUDIO_RESUME_TIMEOUT_MS = 250;

export interface EnsureToneAudioOptions {
    warn?: (message: string, details?: { error: unknown }) => void;
}

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
    if (value === null || value === undefined) {
        return false;
    }
    const candidate = value as PromiseLikeValue<unknown>;
    return typeof candidate.then === 'function';
};

export const waitForPromise = async (
    promiseLike: PromiseLike<unknown>,
    timeoutMs: number,
): Promise<void> => {
    let settled = false;
    const guarded = Promise.resolve(promiseLike).finally(() => {
        settled = true;
    });

    try {
        await Promise.race([guarded, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
    } catch (error) {
        throw error;
    } finally {
        if (!settled) {
            void guarded.catch(() => undefined);
        }
    }
};

export const isAutoplayBlockedError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    if (error.name === 'NotAllowedError') {
        return true;
    }

    const message = error.message ?? '';
    return message.includes('was not allowed to start');
};

export const getToneAudioContext = (): AudioContext => getContext().rawContext as AudioContext;

export const resolveToneTransport = () => {
    try {
        if (typeof getTransport === 'function') {
            return getTransport();
        }
    } catch {
        // Swallow and fall back to Transport constant.
    }
    return Transport;
};

export const ensureToneAudio = async (options?: EnsureToneAudioOptions): Promise<void> => {
    const warn = options?.warn ?? (() => undefined);
    const context = getToneAudioContext();

    const attemptToneStart = async () => {
        try {
            const result = toneStart();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            warn('Tone.start failed', { error });
            throw error;
        }
    };

    if (context.state !== 'running') {
        await attemptToneStart();
    }

    if (context.state === 'suspended') {
        try {
            const result = context.resume();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            warn('AudioContext.resume failed', { error });
            throw error;
        }
    }

    if (context.state !== 'running') {
        warn('Audio context is still suspended after resume attempt');
    }

    const transport = resolveToneTransport();
    if (transport?.state !== 'started' && typeof transport?.start === 'function') {
        try {
            const result = transport.start();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            warn('Tone.Transport.start failed', { error });
            throw error;
        }
    }
};

export const __internalAudioTesting = {
    AUDIO_RESUME_TIMEOUT_MS,
    getToneAudioContext,
};
