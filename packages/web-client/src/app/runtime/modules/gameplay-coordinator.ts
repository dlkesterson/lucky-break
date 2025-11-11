import type { MatterBody, MatterVector } from 'physics/matter';
import { Body as MatterBody_Class, Vector as MatterVector_Class } from 'physics/matter';
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { calculateBallSpeedScale } from 'util/power-ups';
import { clampUnit, mixColors } from 'render/playfield-visuals';
import type { RuntimeVisuals } from '../physics-assembly';
import type { GameplayRuntimeState } from '../types';
import type { RoundMachine } from '../round-machine';
import type { RuntimeScoringHandle } from '../scoring';
import type { VisualEffectsManager } from './visual-effects';
import type { ChromaticTrailManager } from './chromatic-trail';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';
import type { MultiBallColors } from '../../multi-ball-controller';

export interface GameplayCoordinatorDeps {
    readonly runtimeState: GameplayRuntimeState;
    readonly roundMachine: RoundMachine;
    readonly scoring: RuntimeScoringHandle;
    readonly visualEffects: VisualEffectsManager;
    readonly chromaticTrailManager: ChromaticTrailManager;
    readonly powerUpsManager: any;
    readonly laserController: any;
    readonly multiBallController: any;
    readonly gambleRuntime: any;
    readonly echoTrailManager: any;
    readonly vortexFieldManager: any;
    readonly physics: any;
    readonly foreshadowing: any;
    readonly visualBodies: Map<any, any>;
    readonly ball: any;
    readonly paddle: any;
    readonly ballController: any;
    readonly paddleController: any;
    readonly launchController: any;
    readonly inputToPhysics: any;
    readonly visuals: RuntimeVisuals | null;
    readonly session: any;
    readonly bus: any;
    readonly scheduler: any;
    readonly audioState$: any;
    readonly replayBuffer: any;
    readonly updateBrickLighting: (position: { x: number; y: number }) => void;
    readonly resolveComboDecayWindow: () => number;
    readonly toMusicLives: (lives: number) => 1 | 2 | 3;
    readonly pushMusicState: (state: any) => void;
    readonly syncMomentum: () => void;
    readonly syncAutoCompleteCountdownDisplay: () => void;
    readonly handleLevelComplete: () => void;
    readonly forceClearBreakableBricks: () => void;
    readonly clearActivePowerUps: () => void;
    readonly clearActiveCoins: () => void;
    readonly themeBallColors: MultiBallColors;
    readonly themeAccents: { combo: number; powerUp: number };
    readonly paddleVisualDefaults: any;
    readonly visualFactory: any;
    readonly paddleGraphics: any;
    readonly loadoutPhysicsMultipliers: {
        baseSpeed: number;
        maxSpeed: number;
        launchSpeed: number;
    };
    readonly config: {
        BALL_BASE_SPEED: number;
        BALL_MAX_SPEED: number;
        BALL_LAUNCH_SPEED: number;
        PLAYFIELD_WIDTH: number;
        PLAYFIELD_HEIGHT: number;
    };
}

export interface GameplayCoordinator {
    readonly update: (deltaSeconds: number) => void;
}

export const createGameplayCoordinator = (deps: GameplayCoordinatorDeps): GameplayCoordinator => {
    const {
        runtimeState,
        roundMachine,
        scoring,
        visualEffects,
        chromaticTrailManager,
        powerUpsManager,
        laserController,
        multiBallController,
        gambleRuntime,
        echoTrailManager,
        vortexFieldManager,
        physics,
        foreshadowing,
        visualBodies,
        ball,
        paddle,
        ballController,
        paddleController,
        launchController,
        inputToPhysics,
        visuals,
        session,
        bus,
        scheduler,
        audioState$,
        replayBuffer,
        updateBrickLighting,
        resolveComboDecayWindow,
        toMusicLives,
        pushMusicState,
        syncMomentum,
        syncAutoCompleteCountdownDisplay,
        handleLevelComplete,
        forceClearBreakableBricks,
        clearActivePowerUps,
        clearActiveCoins,
        themeBallColors,
        themeAccents,
        paddleVisualDefaults,
        visualFactory,
        paddleGraphics,
        loadoutPhysicsMultipliers,
        config,
    } = deps;

    const scoringState = scoring.state;

    const update = (deltaSeconds: number): void => {
        const audioTimeSeconds = scheduler.now();
        const nextElapsedSeconds = runtimeState.sessionElapsedSeconds + deltaSeconds;

        runtimeState.sessionElapsedSeconds = nextElapsedSeconds;
        replayBuffer.markTime(runtimeState.sessionElapsedSeconds);

        powerUpsManager.tick(deltaSeconds);
        laserController?.update(deltaSeconds);

        const slowTimeScale = powerUpsManager.getSlowTimeScale();
        const slowTimeRemaining = powerUpsManager.getSlowTimeRemaining();
        const timeScale = slowTimeScale;
        const movementDelta = deltaSeconds * timeScale;
        const safeMovementDelta = movementDelta > 0 ? movementDelta : 1 / 240;

        const sessionSnapshot = session.snapshot();
        const bricksRemaining = sessionSnapshot.brickRemaining;
        const bricksTotal = sessionSnapshot.brickTotal;

        const autoResult = roundMachine.tickAutoComplete({
            deltaSeconds,
            bricksRemaining,
            sessionActive: sessionSnapshot.status === 'active',
        });

        if (autoResult.stateChanged) {
            syncAutoCompleteCountdownDisplay();
        }

        if (autoResult.triggered) {
            gambleRuntime?.clearAll();
            forceClearBreakableBricks();
            clearActivePowerUps();
            clearActiveCoins();
            session.completeRound();
            handleLevelComplete();
            return;
        }

        const speedMultiplier = calculateBallSpeedScale(powerUpsManager.getEffect('ball-speed'));
        const difficultyScale = roundMachine.getLevelDifficultyMultiplier();
        const governor = runtimeState.speedGovernorMultiplier;

        const baseTargetSpeed = config.BALL_BASE_SPEED
            * loadoutPhysicsMultipliers.baseSpeed
            * speedMultiplier
            * difficultyScale
            * governor;

        const maxSpeedTarget = config.BALL_MAX_SPEED
            * loadoutPhysicsMultipliers.maxSpeed
            * speedMultiplier
            * difficultyScale
            * governor;

        runtimeState.currentMaxSpeed = Math.max(1, maxSpeedTarget);
        runtimeState.currentBaseSpeed = getAdaptiveBaseSpeed(
            baseTargetSpeed,
            runtimeState.currentMaxSpeed,
            scoringState.combo,
        );

        runtimeState.currentLaunchSpeed = config.BALL_LAUNCH_SPEED
            * loadoutPhysicsMultipliers.launchSpeed
            * speedMultiplier
            * difficultyScale
            * governor;

        audioState$.next({
            combo: scoringState.combo,
            activePowerUps: powerUpsManager.getActiveEffects().map((effect: any) => ({ type: effect.type })),
            lookAheadMs: scheduler.lookAheadMs,
        });

        gambleRuntime?.tick(deltaSeconds);
        echoTrailManager.tick(deltaSeconds);
        vortexFieldManager.tick(deltaSeconds);

        const comboBeforeDecay = scoringState.combo;
        scoring.decayCombo(deltaSeconds);
        if (comboBeforeDecay > 0 && scoringState.combo === 0) {
            session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeDecay });
        }
        syncMomentum();

        const { screen: paddleTarget, playfield: paddleTargetPlayfield } = inputToPhysics.resolveTarget();
        const targetSnapshot = paddleTarget ? { x: paddleTarget.x, y: paddleTarget.y } : null;

        if (
            (runtimeState.lastRecordedInputTarget?.x ?? null) !== (targetSnapshot?.x ?? null) ||
            (runtimeState.lastRecordedInputTarget?.y ?? null) !== (targetSnapshot?.y ?? null)
        ) {
            replayBuffer.recordPaddleTarget(runtimeState.sessionElapsedSeconds, targetSnapshot);
            runtimeState.lastRecordedInputTarget = targetSnapshot ? { ...targetSnapshot } : null;
        }

        if (paddleTargetPlayfield) {
            const currentX = paddle.physicsBody.position.x;
            const nextX = inputToPhysics.computeNextX({
                deltaSeconds,
                currentX,
                paddleWidth: paddle.width,
                target: paddleTargetPlayfield,
            });
            MatterBody_Class.setPosition(paddle.physicsBody, { x: nextX, y: paddle.physicsBody.position.y });
            paddle.position.x = nextX;
        } else {
            paddle.position.x = paddle.physicsBody.position.x;
        }

        paddle.position.y = paddle.physicsBody.position.y;

        const paddleCenter = paddleController.getPaddleCenter(paddle);
        const paddleDelta = Math.hypot(
            paddleCenter.x - runtimeState.previousPaddlePosition.x,
            paddleCenter.y - runtimeState.previousPaddlePosition.y,
        );
        const paddleSpeed = paddleDelta / safeMovementDelta;

        visuals?.paddleLight?.update({
            position: { x: paddleCenter.x, y: paddleCenter.y },
            speed: paddleSpeed,
            deltaSeconds: movementDelta,
        });

        runtimeState.previousPaddlePosition = { x: paddleCenter.x, y: paddleCenter.y };

        const paddleWidthActive = powerUpsManager.isActive('paddle-width');
        const paddlePulseInfluence = clampUnit(runtimeState.paddleGlowPulse);
        const paddleMotionGlow = clampUnit(paddleSpeed / Math.max(80, paddle.speed * 0.85));
        const pulseBase = paddleWidthActive ? 0.65 : 0;
        const paddlePulseLevel = clampUnit(pulseBase + paddlePulseInfluence * 0.85 + paddleMotionGlow * 0.6);
        const paddleAccentColor = paddleWidthActive
            ? themeAccents.powerUp
            : paddlePulseInfluence > 0
                ? mixColors(themeBallColors.aura, themeAccents.powerUp, paddlePulseInfluence)
                : undefined;

        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height, {
            accentColor: paddleAccentColor ?? paddleVisualDefaults.accentColor,
            pulseStrength: paddlePulseLevel,
            motionGlow: paddleMotionGlow,
        });

        ballController.updateAttachment(ball, paddleCenter);
        if (ball.isAttached) {
            physics.updateBallAttachment(ball.physicsBody, paddleCenter);
        }

        if (ball.isAttached) {
            inputToPhysics.syncPaddlePosition(paddleCenter);
        }

        const launchIntent = inputToPhysics.shouldLaunch() ? inputToPhysics.consumeLaunchIntent() : null;
        if (ball.isAttached && launchIntent) {
            replayBuffer.recordLaunch(runtimeState.sessionElapsedSeconds);
            physics.detachBallFromPaddle(ball.physicsBody);
            launchController.launch(ball, launchIntent.direction, runtimeState.currentLaunchSpeed);
            inputToPhysics.resetLaunchTrigger();
            bus.publish('BallLaunched', {
                sessionId: sessionSnapshot.sessionId,
                position: {
                    x: ball.physicsBody.position.x,
                    y: ball.physicsBody.position.y,
                },
                direction: {
                    x: launchIntent.direction.x,
                    y: launchIntent.direction.y,
                },
                speed: MatterVector_Class.magnitude(ball.physicsBody.velocity),
            });
        } else if (launchIntent) {
            inputToPhysics.resetLaunchTrigger();
        }

        const speedBeforeRegulation = MatterVector_Class.magnitude(ball.physicsBody.velocity);
        regulateSpeed(ball.physicsBody, {
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
        });

        const speedAfterRegulation = MatterVector_Class.magnitude(ball.physicsBody.velocity);
        const speedDelta = speedAfterRegulation - speedBeforeRegulation;
        const regulationInfo = Math.abs(speedDelta) > 0.01
            ? {
                direction: speedDelta >= 0 ? ('boost' as const) : ('clamp' as const),
                delta: speedDelta,
            }
            : null;

        const speedRange = Math.max(1, runtimeState.currentMaxSpeed - runtimeState.currentBaseSpeed);
        const normalizedSpeed = speedRange <= 1
            ? clampUnit(speedAfterRegulation / Math.max(1, runtimeState.currentMaxSpeed))
            : clampUnit((speedAfterRegulation - runtimeState.currentBaseSpeed) / speedRange);

        const bricksRatio = bricksTotal > 0 ? clampUnit(bricksRemaining / bricksTotal) : 1;
        const lowLives = sessionSnapshot.livesRemaining <= 1;
        const midLives = sessionSnapshot.livesRemaining === 2;
        const baseWarble = lowLives ? 0.55 : midLives ? 0.25 : 0;
        const warbleIntensity = clampUnit(baseWarble + normalizedSpeed * 0.35 + (1 - bricksRatio) * (lowLives ? 0.35 : 0.2));

        pushMusicState({
            lives: toMusicLives(sessionSnapshot.livesRemaining),
            combo: scoringState.combo,
            tempoRatio: normalizedSpeed,
            bricksRemainingRatio: bricksRatio,
            warbleIntensity,
        });

        const physicsOverlayState: PhysicsDebugOverlayState = {
            currentSpeed: speedAfterRegulation,
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
            timeScale,
            slowTimeScale,
            slowTimeRemaining,
            regulation: regulationInfo,
            extraBalls: multiBallController.count(),
            extraBallCapacity: multiBallController.getCapacity(),
            syncDriftMs: runtimeState.syncDriftMs,
            syncDriftAverageMs: runtimeState.syncDriftAverageMs,
            syncDriftPeakMs: runtimeState.syncDriftPeakMs,
        };

        runtimeState.lastPhysicsDebugState = physicsOverlayState;

        if (movementDelta > 0) {
            physics.step(movementDelta * 1000);
        }

        foreshadowing.updatePredictions();

        visualBodies.forEach((visual: any, body: any) => {
            visual.x = body.position.x;
            visual.y = body.position.y;
            visual.rotation = body.angle;
        });

        updateBrickLighting(ball.physicsBody.position);

        const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
        const decayWindow = resolveComboDecayWindow();
        const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / decayWindow) : 0;
        const comboEnergy = Math.min(
            1.15,
            runtimeState.comboRingPulse * 0.85 + comboIntensity * 0.6 + comboTimerFactor * 0.45,
        );

        const ballTrailSources = visuals?.ballTrailSources;
        if (ballTrailSources) {
            ballTrailSources.length = 0;
            multiBallController.visitActiveBalls(({ body, isPrimary }: any) => {
                const normalizedSpeed = clampUnit(
                    MatterVector_Class.magnitude(body.velocity) / Math.max(1, runtimeState.currentMaxSpeed),
                );
                ballTrailSources.push({
                    id: body.id,
                    position: { x: body.position.x, y: body.position.y },
                    radius: ball.radius,
                    normalizedSpeed,
                    isPrimary,
                });
            });
        }

        const chromaticActiveBalls: {
            id: number;
            position: { x: number; y: number };
            speed: number;
            maxSpeed: number;
            isPrimary: boolean;
        }[] = [];
        multiBallController.visitActiveBalls(({ body, isPrimary }: any) => {
            chromaticActiveBalls.push({
                id: body.id,
                position: { x: body.position.x, y: body.position.y },
                speed: MatterVector_Class.magnitude(body.velocity),
                maxSpeed: runtimeState.currentMaxSpeed,
                isPrimary,
            });
        });

        const chromaticTrailSources = chromaticTrailManager.buildSources({
            ballRadius: ball.radius,
            comboScore: scoringState.combo,
            comboEnergy,
            sessionTime: runtimeState.sessionElapsedSeconds,
            deltaSeconds,
            activeBalls: chromaticActiveBalls,
        });

        const heatDistortionSources: {
            position: { x: number; y: number };
            intensity: number;
            swirl: number;
        }[] = [];

        multiBallController.visitActiveBalls(({ body }: any) => {
            const normalizedX = clampUnit(body.position.x / config.PLAYFIELD_WIDTH);
            const normalizedY = clampUnit(body.position.y / config.PLAYFIELD_HEIGHT);
            const speed = MatterVector_Class.magnitude(body.velocity);
            const normalizedSpeed = clampUnit(speed / Math.max(1, runtimeState.currentMaxSpeed));
            const swirl = 6 + normalizedSpeed * 18;
            heatDistortionSources.push({
                position: { x: normalizedX, y: normalizedY },
                intensity: normalizedSpeed,
                swirl,
            });
        });

        const echoTrails: import('game/echo-trails').EchoTrailSnapshot[] = [];
        echoTrailManager.forEach((_ball: any, snapshot: any) => {
            echoTrails.push(snapshot);
        });

        const vortexFields: import('physics/field-effects').VortexInstance[] = [];
        vortexFieldManager.forEach((vortex: any) => {
            vortexFields.push(vortex);
        });

        visualEffects.update({
            deltaSeconds: movementDelta,
            comboScore: scoringState.combo,
            comboTimer: scoringState.comboTimer,
            comboDecayWindow: decayWindow,
            comboEnergy,
            currentBaseSpeed: runtimeState.currentBaseSpeed,
            currentMaxSpeed: runtimeState.currentMaxSpeed,
            ballTrailSources,
            chromaticTrailSources,
            heatDistortionSources,
            echoTrails,
            vortexFields,
        });
    };

    return {
        update,
    };
};
