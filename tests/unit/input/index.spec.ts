import { describe, expect, it } from 'vitest';
import { GameInputManager, PaddleLaunchManager } from 'input/index';

describe('input barrel', () => {
    it('re-exports input manager implementations', () => {
        expect(typeof GameInputManager).toBe('function');
        expect(typeof PaddleLaunchManager).toBe('function');
    });
});
