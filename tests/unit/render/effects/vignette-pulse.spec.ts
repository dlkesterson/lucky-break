import { describe, expect, it } from 'vitest';
import { createVignettePulse } from 'render/effects/vignette-pulse';

describe('vignette-pulse', () => {
    it('pulses and fades over time', () => {
        const pulse = createVignettePulse({
            width: 640,
            height: 360,
            maxAlpha: 0.5,
            baseAlpha: 0.2,
            decayPerSecond: 1.5,
        });

        expect(pulse.container.visible).toBe(false);
        expect(pulse.container.alpha).toBe(0);

        pulse.pulse(0.8);
        expect(pulse.container.visible).toBe(true);
        const initialAlpha = pulse.container.alpha;
        expect(initialAlpha).toBeGreaterThan(0);

        pulse.update(0.1);
        expect(pulse.container.alpha).toBeLessThan(initialAlpha);
        expect(pulse.container.alpha).toBeGreaterThan(0);

        pulse.update(10);
        expect(pulse.container.visible).toBe(false);
        expect(pulse.container.alpha).toBe(0);

        pulse.destroy();
    });

    it('updates color without recreating container', () => {
        const pulse = createVignettePulse({
            width: 400,
            height: 300,
        });

        const graphics = pulse.container.children[0];
        pulse.setColor(0xff3366);
        pulse.resize({ width: 420, height: 280 });
        expect(pulse.container.children[0]).toBe(graphics);

        pulse.destroy();
    });
});
