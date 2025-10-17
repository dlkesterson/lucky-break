import { describe, expect, it } from 'vitest';
import { buildHudScoreboard } from 'render/hud';
import type { GameSessionSnapshot } from 'app/state';

const createSnapshot = (overrides: Partial<GameSessionSnapshot> = {}): GameSessionSnapshot => {
    const base: GameSessionSnapshot = {
        sessionId: 'session-001',
        status: 'active',
        score: 4250,
        livesRemaining: 2,
        round: 3,
        elapsedTimeMs: 120_000,
        brickTotal: 96,
        brickRemaining: 32,
        lastOutcome: undefined,
        momentum: {
            volleyLength: 9,
            speedPressure: 0.62,
            brickDensity: 32 / 96,
            comboHeat: 7,
            updatedAt: 120_000,
        },
        audio: {
            scene: 'focused',
            nextScene: 'tense',
            barCountdown: 1,
            sends: { reverb: 0.25, delay: 0.18 },
            primaryLayerActive: true,
        },
        preferences: {
            masterVolume: 0.8,
            muted: false,
            reducedMotion: false,
            controlScheme: 'keyboard',
            controlSensitivity: 0.5,
        },
        hud: {
            score: 4250,
            lives: 2,
            round: 3,
            brickRemaining: 32,
            brickTotal: 96,
            momentum: {
                volleyLength: 9,
                speedPressure: 0.62,
                brickDensity: 32 / 96,
                comboHeat: 7,
            },
            audio: {
                scene: 'focused',
                nextScene: 'tense',
                barCountdown: 1,
            },
            prompts: [
                {
                    id: 'momentum-warning',
                    severity: 'warning',
                    message: 'Momentum dropping — keep rally alive!',
                },
            ],
            settings: {
                muted: false,
                masterVolume: 0.8,
                reducedMotion: false,
            },
        },
        updatedAt: 120_000,
    };

    return { ...base, ...overrides };
};

describe('buildHudScoreboard', () => {
    it('formats score, lives, and brick progress for display', () => {
        const snapshot = createSnapshot();

        const view = buildHudScoreboard(snapshot);

        expect(view.statusText).toBe('Round 3 — Active');
        expect(view.entries).toContainEqual({ id: 'score', label: 'Score', value: '4,250' });
        expect(view.entries).toContainEqual({ id: 'lives', label: 'Lives', value: '❤❤' });
        expect(view.entries).toContainEqual({ id: 'bricks', label: 'Bricks', value: '32 / 96 (67%)' });
        expect(view.entries).toContainEqual({ id: 'momentum', label: 'Momentum', value: 'Heat 7 · Volley 9' });
    });

    it('surfaces completed status and prompts when the round ends', () => {
        const snapshot = createSnapshot({
            status: 'completed',
            lastOutcome: {
                result: 'win',
                round: 3,
                scoreAwarded: 6800,
                durationMs: 95_000,
                timestamp: 215_000,
            },
            hud: {
                score: 6800,
                lives: 2,
                round: 3,
                brickRemaining: 0,
                brickTotal: 96,
                momentum: {
                    volleyLength: 12,
                    speedPressure: 0.85,
                    brickDensity: 0,
                    comboHeat: 12,
                },
                audio: {
                    scene: 'climax',
                    nextScene: null,
                    barCountdown: 0,
                },
                prompts: [
                    {
                        id: 'round-complete',
                        severity: 'info',
                        message: 'Round complete — tap to continue',
                    },
                ],
                settings: {
                    muted: false,
                    masterVolume: 0.8,
                    reducedMotion: false,
                },
            },
        });

        const view = buildHudScoreboard(snapshot);

        expect(view.statusText).toBe('Round 3 — Completed');
        expect(view.prompts).toEqual([
            {
                id: 'round-complete',
                message: 'Round complete — tap to continue',
                severity: 'info',
            },
        ]);
        expect(view.summaryLine).toBe('Win in 95s · Score +6,800');
    });

    it('indicates failure and handles muted preferences', () => {
        const snapshot = createSnapshot({
            status: 'failed',
            livesRemaining: 0,
            preferences: {
                masterVolume: 0,
                muted: true,
                reducedMotion: true,
                controlScheme: 'touch',
                controlSensitivity: 0.75,
            },
            hud: {
                score: 1800,
                lives: 0,
                round: 3,
                brickRemaining: 12,
                brickTotal: 96,
                momentum: {
                    volleyLength: 3,
                    speedPressure: 0.2,
                    brickDensity: 0.125,
                    comboHeat: 1,
                },
                audio: {
                    scene: 'calm',
                    nextScene: 'focused',
                    barCountdown: 2,
                },
                prompts: [
                    {
                        id: 'round-failed',
                        severity: 'error',
                        message: 'All lives lost — press retry',
                    },
                ],
                settings: {
                    muted: true,
                    masterVolume: 0,
                    reducedMotion: true,
                },
            },
            lastOutcome: {
                result: 'loss',
                round: 3,
                scoreAwarded: 0,
                durationMs: 64_000,
                timestamp: 184_000,
            },
        });

        const view = buildHudScoreboard(snapshot);

        expect(view.statusText).toBe('Round 3 — Failed');
        expect(view.summaryLine).toBe('Loss in 64s');
        expect(view.entries).toContainEqual({ id: 'audio', label: 'Audio', value: 'Muted' });
    });
});
