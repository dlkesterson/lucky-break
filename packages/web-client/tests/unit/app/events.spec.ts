import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from 'app/events';

describe('createEventBus', () => {
    const sampleBrickBreakPayload = {
        sessionId: 'session-1',
        row: 2,
        col: 3,
        impactVelocity: 12,
        brickType: 'standard' as const,
        comboHeat: 4,
        initialHp: 1,
    };

    it('uses the injected clock when no timestamp is provided', () => {
        let nowValue = 1000;
        const bus = createEventBus({ now: () => nowValue });
        const listener = vi.fn();
        bus.subscribe('BrickBreak', listener);

        nowValue = 1234;
        bus.publish('BrickBreak', sampleBrickBreakPayload);

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0][0];
        expect(event.timestamp).toBe(1234);
    });

    it('prefers an explicit timestamp when provided', () => {
        const bus = createEventBus({ now: () => 999 });
        const listener = vi.fn();
        bus.subscribe('BrickBreak', listener);

        bus.publish('BrickBreak', sampleBrickBreakPayload, 555);

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0][0];
        expect(event.timestamp).toBe(555);
    });
});
