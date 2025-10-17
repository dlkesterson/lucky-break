import { describe, expect, it } from 'vitest';
import { createStage } from 'render/index';

describe('render barrel', () => {
    it('exports the stage factory', () => {
        expect(typeof createStage).toBe('function');
    });
});
