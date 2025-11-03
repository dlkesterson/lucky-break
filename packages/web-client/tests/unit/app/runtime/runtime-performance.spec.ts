import { describe, expect, it, vi } from 'vitest';
import { createRuntimePerformance, type RuntimePerformanceHandle } from 'app/runtime/modules/runtime-performance';
import type { RuntimeVisuals } from 'app/runtime/physics-assembly';

type FrameMetricsHandler = NonNullable<RuntimePerformanceHandle['handleFrameMetrics']>;

type PreferenceListener = Parameters<
    Parameters<typeof createRuntimePerformance>[0]['subscribePreference']
>[0];

interface Harness {
    readonly runtimePerformance: RuntimePerformanceHandle;
    readonly setEffectProfile: ReturnType<typeof vi.fn>;
    readonly logger: { readonly info: ReturnType<typeof vi.fn> };
    readonly emitFrame: (deltaMs: number, iterations: number) => void;
    readonly callFrameMetrics: (deltaMs: number) => void;
    readonly setUserPreference: (preference: boolean) => void;
    readonly unsubscribe: ReturnType<typeof vi.fn>;
}

const createHarness = (options?: { readonly initialPreference?: boolean; readonly provideUnsubscribe?: boolean }): Harness => {
    const logger = { info: vi.fn() };
    const setEffectProfile = vi.fn();
    const visuals = { setEffectProfile } as unknown as RuntimeVisuals;

    let listener: PreferenceListener | undefined;
    const unsubscribe = vi.fn();
    const subscribePreference: (next: PreferenceListener) => (() => void) | null = (next) => {
        listener = next;
        if (options?.provideUnsubscribe === false) {
            return null;
        }
        return () => {
            unsubscribe();
        };
    };

    const runtimePerformance = createRuntimePerformance({
        logger,
        initialPreference: options?.initialPreference ?? false,
        subscribePreference,
    });

    runtimePerformance.updateVisuals(visuals);

    const handleFrameMetrics: FrameMetricsHandler = runtimePerformance.handleFrameMetrics!;

    const callFrameMetrics = (deltaMs: number) => {
        const metrics: Parameters<FrameMetricsHandler>[0] = {
            rawDeltaMs: deltaMs,
            appliedDeltaMs: deltaMs,
            stepsExecuted: 1,
            interpolation: 0,
        };
        handleFrameMetrics(metrics);
    };

    const emitFrame = (deltaMs: number, iterations: number) => {
        for (let index = 0; index < iterations; index += 1) {
            callFrameMetrics(deltaMs);
        }
    };

    const setUserPreference = (preference: boolean) => {
        if (!listener) {
            throw new Error('preference listener was not registered');
        }
        listener(preference);
    };

    return {
        runtimePerformance,
        setEffectProfile,
        logger,
        emitFrame,
        callFrameMetrics,
        setUserPreference,
        unsubscribe,
    } satisfies Harness;
};

describe('createRuntimePerformance', () => {
    it('applies visual profile updates when user preference changes', () => {
        const harness = createHarness();

        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('quality');

        harness.setUserPreference(true);

        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('performance');
        expect(harness.runtimePerformance.getProfile()).toBe('performance');
        expect(harness.unsubscribe).not.toHaveBeenCalled();

        harness.runtimePerformance.dispose();
    });

    it('ignores invalid frame metrics without logging or profile changes', () => {
        const harness = createHarness();
        const initialCalls = harness.setEffectProfile.mock.calls.length;

        harness.callFrameMetrics(Number.NaN);
        harness.callFrameMetrics(-5);
        harness.callFrameMetrics(0);

        expect(harness.setEffectProfile).toHaveBeenCalledTimes(initialCalls);
        expect(harness.logger.info).not.toHaveBeenCalled();

        harness.runtimePerformance.dispose();
    });

    it('switches to performance profile after sustained low FPS and recovers on high FPS', () => {
        const harness = createHarness();

        harness.emitFrame(100, 40);

        expect(harness.logger.info).toHaveBeenCalledWith(
            'Enabling performance profile due to sustained low FPS',
            expect.objectContaining({ fps: expect.any(Number) }),
        );
        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('performance');
        expect(harness.runtimePerformance.getProfile()).toBe('performance');

        harness.emitFrame(12, 500);

        expect(harness.logger.info).toHaveBeenLastCalledWith(
            'Restoring quality profile after sustained recovery',
            expect.objectContaining({ fps: expect.any(Number) }),
        );
        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('quality');
        expect(harness.runtimePerformance.getProfile()).toBe('quality');

        harness.runtimePerformance.dispose();
    });

    it('keeps performance profile when user preference forces it even after recovery', () => {
        const harness = createHarness();

        harness.setUserPreference(true);

        harness.emitFrame(100, 40);
        harness.emitFrame(12, 500);

        expect(harness.logger.info).toHaveBeenCalledTimes(1);
        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('performance');
        expect(harness.runtimePerformance.getProfile()).toBe('performance');

        harness.runtimePerformance.dispose();
    });

    it('reset clears dynamic performance mode and reapplies quality profile', () => {
        const harness = createHarness();

        harness.emitFrame(100, 40);
        expect(harness.runtimePerformance.getProfile()).toBe('performance');

        harness.setEffectProfile.mockClear();
        harness.runtimePerformance.reset();

        expect(harness.setEffectProfile).toHaveBeenLastCalledWith('quality');
        expect(harness.runtimePerformance.getProfile()).toBe('quality');

        harness.runtimePerformance.dispose();
    });

    it('dispose calls unsubscribe when available and tolerates missing unsubscribe handler', () => {
        const harness = createHarness();
        harness.runtimePerformance.dispose();
        expect(harness.unsubscribe).toHaveBeenCalledTimes(1);

        const withoutUnsubscribe = createHarness({ provideUnsubscribe: false });
        expect(() => withoutUnsubscribe.runtimePerformance.dispose()).not.toThrow();
    });
});
