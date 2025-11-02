import { describe, it, expect } from 'vitest';
import { createLaserEffect } from 'render/effects/laser';

describe('render/effects/laser', () => {
    it('renders beams and fades them out over time', () => {
        const effect = createLaserEffect({ fadeDuration: 0.05 });
        expect(effect.container.children.length).toBe(0);

        effect.fire({
            duration: 0.1,
            beams: [
                {
                    origin: { x: 100, y: 300 },
                    hitY: 50,
                    hits: [{ x: 100, y: 80 }],
                },
            ],
        });

        expect(effect.container.children.length).toBeGreaterThan(0);

        effect.update(0.025);
        expect(effect.container.children.length).toBeGreaterThan(0);

        effect.update(0.25);
        expect(effect.container.children.length).toBe(0);

        effect.destroy();
    });

    it('ignores empty fire payloads gracefully', () => {
        const effect = createLaserEffect();
        expect(() => effect.fire({ beams: [], duration: 0.1 })).not.toThrow();
        effect.update(0.5);
        expect(effect.container.children.length).toBe(0);
        effect.destroy();
    });
});
