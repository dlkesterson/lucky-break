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
});
