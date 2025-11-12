/**
 * Integration Tests: Runtime HUD Bridge
 *
 * Tests the interaction between scoring → session state → HUD updates
 * This guards against regressions where HUD doesn't update after game events
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createGameSessionManager, type GameSessionManager } from 'app/state';
import { createScoring, awardBrickPoints, getMomentumMetrics, type ScoreState } from 'util/scoring';
import { hudSetters, useHud } from 'ui/state/game-bridge';
import { gameConfig } from 'config/game';

describe('Runtime HUD Bridge Integration', () => {
    let session: GameSessionManager;
    let scoring: ScoreState;
    let hudUpdateCalls: number;

    beforeEach(() => {
        // Reset HUD state
        hudSetters.reset();
        hudUpdateCalls = 0;

        // Create fresh session
        session = createGameSessionManager({
            sessionId: 'test-integration-session',
        });

        // Create scoring system with HUD update callback
        scoring = createScoring();
        scoring.updateHUD = () => {
            hudUpdateCalls++;
        };
    });

    describe('Scoring → Session → HUD Flow', () => {
        it('updates HUD when brick breaks are recorded', () => {
            // Start round
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            // Simulate brick break with scoring
            const points = awardBrickPoints(
                scoring,
                { comboDecayTime: gameConfig.scoring.comboDecayTime },
                {
                    bricksRemaining: 9,
                    brickTotal: 10,
                    impactSpeed: 300,
                    maxSpeed: gameConfig.ball.maxSpeed,
                },
            );

            // Record in session
            session.recordBrickBreak({
                points,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: scoring.combo,
                },
                momentum: getMomentumMetrics(scoring),
            });

            // Verify scoring state updated
            expect(scoring.score).toBeGreaterThan(0);
            expect(scoring.combo).toBe(1);

            // Verify session state updated
            const snapshot = session.snapshot();
            expect(snapshot.score).toBe(scoring.score);
            expect(snapshot.brickRemaining).toBe(9);

            // Verify HUD callback was invoked
            expect(hudUpdateCalls).toBeGreaterThan(0);
        });

        it('maintains score consistency between scoring system and session', () => {
            session.startRound({ breakableBricks: 5, roundNumber: 1 });

            let bricksRemaining = 5;
            const breakCount = 3;

            for (let i = 0; i < breakCount; i++) {
                bricksRemaining--;

                const points = awardBrickPoints(
                    scoring,
                    { comboDecayTime: gameConfig.scoring.comboDecayTime },
                    {
                        bricksRemaining,
                        brickTotal: 5,
                        impactSpeed: 300,
                        maxSpeed: gameConfig.ball.maxSpeed,
                    },
                );

                session.recordBrickBreak({
                    points,
                    event: {
                        row: 0,
                        col: i,
                        impactVelocity: 300,
                        brickType: 'standard',
                        initialHp: 1,
                        comboHeat: scoring.combo,
                    },
                    momentum: getMomentumMetrics(scoring),
                });
            }

            // Scoring and session should always agree
            expect(session.snapshot().score).toBe(scoring.score);
            expect(session.snapshot().brickRemaining).toBe(bricksRemaining);
        });

        it('updates HUD with correct momentum metrics after combo chains', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            // Break 3 bricks in quick succession to build combo
            for (let i = 0; i < 3; i++) {
                const bricksRemaining = 10 - (i + 1);
                const points = awardBrickPoints(
                    scoring,
                    { comboDecayTime: gameConfig.scoring.comboDecayTime },
                    {
                        bricksRemaining,
                        brickTotal: 10,
                        impactSpeed: 350,
                        maxSpeed: gameConfig.ball.maxSpeed,
                    },
                );

                session.recordBrickBreak({
                    points,
                    event: {
                        row: 0,
                        col: i,
                        impactVelocity: 350,
                        brickType: 'standard',
                        initialHp: 1,
                        comboHeat: scoring.combo,
                    },
                    momentum: getMomentumMetrics(scoring),
                });
            }

            const snapshot = session.snapshot();
            expect(snapshot.momentum).toBeDefined();
            expect(snapshot.momentum.volleyLength).toBe(3);
            expect(snapshot.momentum.comboHeat).toBeGreaterThan(0);
        });
    });

    describe('HUD State Synchronization', () => {
        it('updateFromRuntime correctly applies all runtime payload fields', () => {
            const payload = {
                score: 1500,
                lives: 2,
                coins: 50,
                combo: 5,
                difficultyMultiplier: 1.5,
                comboTimer: 1.2,
                brickRemaining: 7,
                brickTotal: 10,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: 'In Progress',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 5,
                    speedPressure: 0.7,
                    brickDensity: 0.7,
                    comboHeat: 0.625,
                    comboTimer: 1.2,
                    mirageStacks: 0,
                },
                prompts: [],
                settings: {
                    muted: false,
                    masterVolume: 0.8,
                    reducedMotion: false,
                },
                physics: {
                    currentSpeed: 300,
                    baseSpeed: 250,
                    maxSpeed: 450,
                    gravity: 0,
                },
            };

            hudSetters.updateFromRuntime(payload);

            const hudState = useHud.getState();
            expect(hudState.score).toBe(1500);
            expect(hudState.lives).toBe(2);
            expect(hudState.coins).toBe(50);
            expect(hudState.combo).toBe(5);
            expect(hudState.difficultyMultiplier).toBe(1.5);
            expect(hudState.comboTimer).toBe(1.2);
            expect(hudState.brickRemaining).toBe(7);
            expect(hudState.brickTotal).toBe(10);
            expect(hudState.momentum).toBeDefined();
            expect(hudState.momentum?.volleyLength).toBe(5);
            expect(hudState.physics).toBeDefined();
            expect(hudState.physics?.currentSpeed).toBe(300);
        });

        it('HUD state reflects session changes after multiple brick breaks', () => {
            session.startRound({ breakableBricks: 8, roundNumber: 1 });

            // Simulate runtime updating HUD
            const updateHudFromSession = () => {
                const snapshot = session.snapshot();
                hudSetters.updateFromRuntime({
                    score: snapshot.score,
                    lives: snapshot.livesRemaining,
                    coins: snapshot.coins,
                    combo: scoring.combo,
                    difficultyMultiplier: 1.0,
                    comboTimer: scoring.comboTimer,
                    brickRemaining: snapshot.brickRemaining,
                    brickTotal: snapshot.brickTotal,
                    scoreboard: {
                        statusText: 'Round 1',
                        summaryLine: 'In Progress',
                        entries: [],
                        prompts: [],
                    },
                    activePowerUps: [],
                    reward: null,
                    entropyActions: [],
                    momentum: snapshot.momentum,
                    prompts: [],
                    settings: {
                        muted: false,
                        masterVolume: 1,
                        reducedMotion: false,
                    },
                    physics: null,
                });
            };

            // Initial state
            updateHudFromSession();
            expect(useHud.getState().brickRemaining).toBe(8);
            expect(useHud.getState().score).toBe(0);

            // Break a brick
            const points = awardBrickPoints(
                scoring,
                { comboDecayTime: gameConfig.scoring.comboDecayTime },
                {
                    bricksRemaining: 7,
                    brickTotal: 8,
                    impactSpeed: 300,
                    maxSpeed: gameConfig.ball.maxSpeed,
                },
            );

            session.recordBrickBreak({
                points,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: scoring.combo,
                },
                momentum: getMomentumMetrics(scoring),
            });

            // Update HUD again
            updateHudFromSession();

            // HUD should reflect the change
            expect(useHud.getState().brickRemaining).toBe(7);
            expect(useHud.getState().score).toBe(points);
            expect(useHud.getState().combo).toBe(1);
        });
    });

    describe('Session State Edge Cases', () => {
        it('completeRound resets brick count to zero', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });
            const initialSnapshot = session.snapshot();
            expect(initialSnapshot.brickRemaining).toBe(10);

            session.completeRound();
            const afterSnapshot = session.snapshot();

            // completeRound resets the round, so brick count goes to 0
            expect(afterSnapshot.brickRemaining).toBe(0);
        });

        it('recordBrickBreak decrements brick count', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            session.recordBrickBreak({
                points: 100,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: 0,
                },
                momentum: getMomentumMetrics(scoring),
            });

            expect(session.snapshot().brickRemaining).toBe(9);
        });

        it('multiple recordBrickBreak calls correctly decrement brick count', () => {
            session.startRound({ breakableBricks: 5, roundNumber: 1 });

            for (let i = 0; i < 3; i++) {
                session.recordBrickBreak({
                    points: 100,
                    event: {
                        row: 0,
                        col: i,
                        impactVelocity: 300,
                        brickType: 'standard',
                        initialHp: 1,
                        comboHeat: 0,
                    },
                    momentum: getMomentumMetrics(scoring),
                });
            }

            expect(session.snapshot().brickRemaining).toBe(2);
        });
    });
});
