import { describe, expect, it } from 'vitest';
import type { InputType, Vector2 } from 'types/index';

describe('types barrel', () => {
    it('re-exports Vector2 type definition', () => {
        const vector: Vector2 = { x: 1, y: 2 };
        expect(vector).toEqual({ x: 1, y: 2 });
    });

    it('includes the InputType union', () => {
        const inputType: InputType = 'mouse';
        expect(inputType).toBe('mouse');
    });
});
