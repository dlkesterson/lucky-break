import { beforeEach, describe, expect, it } from 'vitest';
import { clearHighScores, getHighScores, recordHighScore } from 'util/high-scores';

describe('high score utilities', () => {
    beforeEach(() => {
        window.localStorage.clear();
        clearHighScores();
    });

    it('stores accepted high scores in descending order', () => {
        const resultA = recordHighScore(5_000, {
            name: 'AAA',
            round: 2,
            achievedAt: 100,
        });
        expect(resultA.accepted).toBe(true);

        const resultB = recordHighScore(7_200, {
            name: 'BBB',
            round: 3,
            achievedAt: 200,
        });
        expect(resultB.accepted).toBe(true);

        const entries = getHighScores();
        expect(entries).toHaveLength(2);
        expect(entries[0]?.score).toBe(7_200);
        expect(entries[0]?.name).toBe('BBB');
        expect(entries[1]?.score).toBe(5_000);
        expect(entries[1]?.name).toBe('AAA');
    });

    it('enforces a maximum of ten high score entries', () => {
        for (let index = 0; index < 12; index += 1) {
            recordHighScore(1_000 + index, {
                achievedAt: index,
            });
        }

        const entries = getHighScores();
        expect(entries).toHaveLength(10);
        expect(entries[0]?.score).toBeGreaterThan(entries.at(-1)?.score ?? 0);
    });

    it('rejects scores below the requested minimum', () => {
        const result = recordHighScore(0, { minScore: 1 });
        expect(result.accepted).toBe(false);
        expect(getHighScores()).toHaveLength(0);
    });

    it('normalizes player names and round metadata', () => {
        const longName = 'ABCDEFGHIJKLMNOPQR';
        const result = recordHighScore(1_500, {
            name: `${longName}   `,
            round: 6.7,
            achievedAt: 1234.56,
        });

        expect(result.accepted).toBe(true);
        const [entry] = result.entries;
        expect(entry?.name).toBe('ABCDEFGHIJKLMNOP');
        expect(entry?.round).toBe(6);
        expect(entry?.achievedAt).toBe(1234);
    });

    it('falls back to default player name when blank', () => {
        const result = recordHighScore(900, { name: '   ' });
        expect(result.accepted).toBe(true);
        expect(result.entries[0]?.name).toBe('PLAYER');
    });

    it('rejects non-finite scores and preserves existing entries', () => {
        recordHighScore(1_000);
        const before = getHighScores();

        const result = recordHighScore(Number.NaN);

        expect(result.accepted).toBe(false);
        expect(result.entries).toEqual(before);
    });

    it('recovers when stored high scores are corrupted', () => {
        window.localStorage.setItem('lucky-break::high-scores::v1', 'not-json');

        const result = recordHighScore(2_000, { name: 'ZZZ' });

        expect(result.accepted).toBe(true);
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]?.name).toBe('ZZZ');
    });
});
