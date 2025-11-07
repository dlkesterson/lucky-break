import { describe, expect, it } from 'vitest';
import { createNebulaSlotsMachine, evaluateNebulaSlotSymbols } from 'app/runtime/casino-games';

describe('evaluateNebulaSlotSymbols', () => {
    it('classifies triple jackpot symbols as reforge jackpot', () => {
        const outcome = evaluateNebulaSlotSymbols(['777', '777', '777'] as const, 3);
        expect(outcome.rarity).toBe('jackpot');
        expect(outcome.biasRisk).toBe('reforge');
        expect(outcome.wildcard).toBe(true);
    });

    it('treats tilt pair with wildcard as bias forecast', () => {
        const outcome = evaluateNebulaSlotSymbols(['TILT', 'TILT', 'GLIM'] as const, 5);
        expect(outcome.rarity).toBe('bias');
        expect(outcome.biasRisk).toBe('tilt');
        expect(outcome.headline).toMatch(/Bias Forecast/i);
    });

    it('offers tease insight when no reel aligns fully', () => {
        const outcome = evaluateNebulaSlotSymbols(['VOID', 'STAR', 'LUCK'] as const, 7);
        expect(outcome.rarity).toBe('tease');
        expect(outcome.biasRisk).toBe('tilt');
        expect(outcome.detail).toMatch(/odds are warming up|currents stir/i);
    });
});

describe('createNebulaSlotsMachine', () => {
    it('returns deterministic outcomes for the same seed and spin index', () => {
        const machine = createNebulaSlotsMachine(1234, { level: 2, entropy: 10 });
        const first = machine.spin(1);
        const repeat = machine.spin(1);
        expect(repeat).toEqual(first);

        const second = machine.spin(2);
        expect(second.spinIndex).toBe(2);
        expect(second.symbols.length).toBe(3);
        expect(second).not.toEqual(first);
    });
});
