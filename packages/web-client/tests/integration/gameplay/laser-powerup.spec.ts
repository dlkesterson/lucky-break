import { describe, it, expect, vi } from 'vitest';
import { createLaserController } from 'app/runtime/laser';
import { createEventBus } from 'app/events';
import { Bodies } from 'physics/matter';

const createReward = () => ({
    type: 'laser-paddle' as const,
    duration: 0.2,
    cooldown: 0.05,
    beamVelocity: 28,
    pierceCount: 1,
});

describe('gameplay laser power-up integration', () => {
    it('fires beams and applies strikes to the closest brick', () => {
        const bus = createEventBus();
        const emitted: string[] = [];
        bus.subscribe('LaserFire', (event) => emitted.push(event.type));
        bus.subscribe('LaserHit', (event) => emitted.push(event.type));

        const collision = { applyLaserStrike: vi.fn() };
        const brickHealth = new Map();
        const brickMetadata = new Map();
        const brick = Bodies.rectangle(220, 120, 48, 20, { label: 'brick' });
        brickHealth.set(brick, 1);
        brickMetadata.set(brick, { row: 1, col: 3, x: 220, y: 120, hp: 1 });

        const controller = createLaserController({
            collisionRuntime: collision,
            visuals: null,
            levelRuntime: { brickHealth, brickMetadata },
            bus,
            getSessionId: () => 'session-1',
            computeScheduledAudioTime: () => 1.25,
            scheduleVisualEffect: (_time, effect) => effect(),
            playfieldTop: 0,
            getPaddleState: () => ({
                center: { x: 220, y: 360 },
                width: 110,
                height: 24,
            }),
        });

        controller.activate(createReward());
        controller.update(0.05);

        expect(collision.applyLaserStrike).toHaveBeenCalled();
        expect(emitted.filter((type) => type === 'LaserFire').length).toBeGreaterThan(0);
        expect(emitted.filter((type) => type === 'LaserHit').length).toBeGreaterThan(0);

        controller.update(0.3);
        expect(controller.isActive()).toBe(false);
        controller.dispose();
    });
});
