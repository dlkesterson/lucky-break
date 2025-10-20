import { describe, expect, it } from 'vitest';
import { createReplayBuffer, type ReplayRecording } from 'app/replay-buffer';

describe('createReplayBuffer', () => {
    const getRecording = (seed: number | null, configure: (timeStep: (time: number) => void) => void): ReplayRecording => {
        const buffer = createReplayBuffer();
        buffer.begin(seed);
        let currentTime = 0;
        const advance = (delta: number) => {
            currentTime += delta;
            buffer.markTime(currentTime);
        };
        configure(advance);
        return buffer.snapshot();
    };

    it('captures paddle target changes with deduplication', () => {
        const buffer = createReplayBuffer();
        buffer.begin(42);
        buffer.recordPaddleTarget(0, { x: 100, y: 200 });
        buffer.recordPaddleTarget(0.016, { x: 100.3, y: 199.9 });
        buffer.recordPaddleTarget(0.032, { x: 220, y: 400 });
        buffer.recordPaddleTarget(0.048, null);

        const recording = buffer.snapshot();
        const targetEvents = recording.events.filter((event) => event.type === 'paddle-target');

        expect(recording.seed).toBe(42);
        expect(targetEvents).toHaveLength(3);
        expect(targetEvents[0]).toEqual({
            type: 'paddle-target',
            time: 0,
            position: { x: 100, y: 200 },
        });
        expect(targetEvents[1]).toEqual({
            type: 'paddle-target',
            time: 0.032,
            position: { x: 220, y: 400 },
        });
        expect(targetEvents[2]).toEqual({
            type: 'paddle-target',
            time: 0.048,
            position: null,
        });
    });

    it('records launch events with monotonically increasing times', () => {
        const buffer = createReplayBuffer();
        buffer.begin(7);
        buffer.recordLaunch(0.016);
        buffer.recordLaunch(0.016);
        buffer.recordLaunch(0.032);

        const launchEvents = buffer.snapshot().events.filter((event) => event.type === 'launch');

        expect(launchEvents).toEqual([
            { type: 'launch', time: 0.016 },
            { type: 'launch', time: 0.032 },
        ]);
    });

    it('tracks seed changes when recording is active', () => {
        const buffer = createReplayBuffer();
        buffer.begin(13);
        buffer.recordSeed(13, 0.1);
        buffer.recordSeed(21, 0.2);
        buffer.recordSeed(34, 0.3);

        const events = buffer.snapshot().events.filter((event) => event.type === 'seed-change');

        expect(events).toEqual([
            { type: 'seed-change', time: 0.2, seed: 21 },
            { type: 'seed-change', time: 0.3, seed: 34 },
        ]);
    });

    it('keeps duration in sync even without events', () => {
        const recording = getRecording(5, (advance) => {
            advance(0.5);
            advance(0.5);
        });
        expect(recording.durationSeconds).toBeCloseTo(1, 6);
        expect(recording.events).toHaveLength(0);
    });

    it('provides defensive copies of recordings', () => {
        const buffer = createReplayBuffer();
        buffer.begin(99);
        buffer.recordPaddleTarget(0.016, { x: 10, y: 20 });

        const snapshotA = buffer.snapshot();
        const snapshotB = buffer.snapshot();

        expect(snapshotA).not.toBe(snapshotB);
        expect(snapshotA.events[0]).not.toBe(snapshotB.events[0]);

        (snapshotA.events[0] as any).position.x = 999;
        expect(buffer.snapshot().events[0]).toEqual({
            type: 'paddle-target',
            time: 0.016,
            position: { x: 10, y: 20 },
        });
    });
});
