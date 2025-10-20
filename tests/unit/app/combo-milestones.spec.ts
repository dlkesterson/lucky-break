import { describe, expect, it } from 'vitest';
import { createEventBus, type ComboMilestonePayload } from 'app/events';
import { publishComboMilestoneIfNeeded } from 'app/combo-milestones';

const captureComboMilestones = () => {
    const bus = createEventBus();
    const payloads: ComboMilestonePayload[] = [];
    bus.subscribe('ComboMilestoneReached', (event) => {
        payloads.push(event.payload);
    });
    return { bus, payloads } as const;
};

describe('publishComboMilestoneIfNeeded', () => {
    it('publishes an event when the combo reaches a milestone', () => {
        const { bus, payloads } = captureComboMilestones();

        const emitted = publishComboMilestoneIfNeeded({
            bus,
            sessionId: 'session-123',
            previousCombo: 7,
            currentCombo: 8,
            pointsAwarded: 18,
            totalScore: 540,
        });

        expect(emitted).toBe(true);
        expect(payloads).toHaveLength(1);
        const payload = payloads[0];
        expect(payload).toBeDefined();
        if (!payload) {
            throw new Error('Expected combo milestone payload');
        }
        expect(payload.sessionId).toBe('session-123');
        expect(payload.combo).toBe(8);
        expect(payload.multiplier).toBeCloseTo(1.25, 5);
        expect(payload.pointsAwarded).toBe(18);
        expect(payload.totalScore).toBe(540);
    });

    it('does not publish when no milestone is reached', () => {
        const { bus, payloads } = captureComboMilestones();

        const emitted = publishComboMilestoneIfNeeded({
            bus,
            sessionId: 'session-456',
            previousCombo: 3,
            currentCombo: 4,
            pointsAwarded: 12,
            totalScore: 120,
        });

        expect(emitted).toBe(false);
        expect(payloads).toHaveLength(0);
    });

    it('respects custom scoring thresholds', () => {
        const { bus, payloads } = captureComboMilestones();

        const emitted = publishComboMilestoneIfNeeded({
            bus,
            sessionId: 'session-789',
            previousCombo: 4,
            currentCombo: 5,
            pointsAwarded: 22,
            totalScore: 310,
            config: {
                multiplierThreshold: 5,
                multiplierPerThreshold: 0.5,
            },
        });

        expect(emitted).toBe(true);
        expect(payloads).toHaveLength(1);
        const payload = payloads[0];
        expect(payload).toBeDefined();
        if (!payload) {
            throw new Error('Expected combo milestone payload');
        }
        expect(payload.multiplier).toBeCloseTo(1.5, 5);
    });
});
