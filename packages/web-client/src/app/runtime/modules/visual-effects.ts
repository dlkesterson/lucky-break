import type { MatterBody } from 'physics/matter';
import { Vector as MatterVector } from 'physics/matter';
import { clampUnit, mixColors } from 'render/playfield-visuals';
import type { RuntimeVisuals } from '../physics-assembly';
import type { MultiBallColors } from '../../multi-ball-controller';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';

export interface VisualEffectsState {
    ballGlowPulse: number;
    paddleGlowPulse: number;
    comboRingPulse: number;
    comboRingPhase: number;
    lastPhysicsDebugState: PhysicsDebugOverlayState | null;
}

export interface VisualEffectsContext {
    readonly visuals: RuntimeVisuals | null;
    readonly ballBody: MatterBody;
    readonly ballRadius: number;
    readonly ballHueFilter: any;
    readonly ballGlowFilter: any;
    readonly multiBallController: any;
    readonly themeBallColors: MultiBallColors;
    readonly themeAccents: { combo: number; powerUp: number };
    readonly backgroundAccentColor: number;
    readonly bloomAccentColor: number;
    readonly playfieldWidth: number;
    readonly playfieldHeight: number;
    readonly getCurrentBaseSpeed: () => number;
    readonly getCurrentMaxSpeed: () => number;
}

export interface VisualEffectsUpdateParams {
    readonly deltaSeconds: number;
    readonly comboScore: number;
    readonly comboTimer: number;
    readonly comboDecayWindow: number;
    readonly comboEnergy: number;
    readonly currentBaseSpeed: number;
    readonly currentMaxSpeed: number;
    readonly ballTrailSources?: {
        id: number;
        position: { x: number; y: number };
        radius: number;
        normalizedSpeed: number;
        isPrimary: boolean;
    }[];
    readonly chromaticTrailSources?: {
        id: number;
        position: { x: number; y: number };
        radius: number;
        normalizedSpeed: number;
        isPrimary: boolean;
    }[];
    readonly heatDistortionSources?: {
        position: { x: number; y: number };
        intensity: number;
        swirl: number;
    }[];
    readonly echoTrails?: import('game/echo-trails').EchoTrailSnapshot[];
    readonly vortexFields?: import('physics/field-effects').VortexInstance[];
}

export interface VisualEffectsManager {
    readonly state: VisualEffectsState;
    readonly update: (params: VisualEffectsUpdateParams) => void;
    readonly updateBallHue: (ballHueShift: number) => number;
}

export const createVisualEffectsManager = (context: VisualEffectsContext): VisualEffectsManager => {
    const state: VisualEffectsState = {
        ballGlowPulse: 0,
        paddleGlowPulse: 0,
        comboRingPulse: 0,
        comboRingPhase: 0,
        lastPhysicsDebugState: null,
    };

    let ballHueShift = 0;

    const updateBallHue = (currentHueShift: number): number => {
        ballHueShift = currentHueShift;
        return ballHueShift;
    };

    const updateComboRing = (params: VisualEffectsUpdateParams, movementDelta: number): void => {
        const { visuals, ballBody, ballRadius, themeBallColors, themeAccents } = context;
        const { comboScore, comboTimer, comboDecayWindow, comboEnergy } = params;

        const comboRing = visuals?.comboRing ?? null;
        if (!comboRing) return;

        const comboActive = comboScore >= 2 && comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(comboScore / 14) : 0;

        if (comboEnergy > 0) {
            const comboPhaseSpeed = 2.4 + comboIntensity * 3 + state.comboRingPulse * 2.5;
            const nextPhase = (state.comboRingPhase + movementDelta * comboPhaseSpeed) % (Math.PI * 2);
            state.comboRingPhase = nextPhase;
        }

        const shouldDisplayComboRing = comboEnergy > 0.02;
        if (shouldDisplayComboRing) {
            const ringPos = ballBody.position;
            const baseRadius = ballRadius * (2 + comboIntensity * 0.55);
            const wobble = Math.sin(state.comboRingPhase * 2) * 0.18;
            const radius = baseRadius * (1 + wobble) + comboEnergy * ballRadius * 0.4;

            const outerColor = mixColors(
                themeBallColors.highlight,
                themeAccents.combo,
                Math.min(1, comboEnergy * 0.7),
            );
            const innerColor = mixColors(
                themeAccents.combo,
                themeBallColors.aura,
                0.3 + comboEnergy * 0.4,
            );
            const outerAlpha = Math.min(1, 0.35 + comboEnergy * 0.4);
            const innerAlpha = Math.min(1, 0.28 + comboEnergy * 0.32);
            const fillAlpha = Math.min(1, 0.05 + comboEnergy * 0.12);
            const overallAlpha = Math.min(1, 0.25 + comboEnergy * 0.45);

            comboRing.update({
                position: ringPos,
                radius,
                outerColor,
                outerAlpha,
                innerColor,
                innerAlpha,
                fillAlpha,
                overallAlpha,
            });
        } else {
            comboRing.hide();
        }
    };

    const updateBallEffects = (params: VisualEffectsUpdateParams, movementDelta: number): void => {
        const { visuals, ballBody, ballRadius, themeBallColors, themeAccents, getCurrentBaseSpeed, getCurrentMaxSpeed } = context;
        const { comboEnergy } = params;

        const currentBaseSpeed = getCurrentBaseSpeed();
        const currentMaxSpeed = getCurrentMaxSpeed();

        const ballPulse = Math.min(1, comboEnergy * 0.5 + state.ballGlowPulse);
        const ballHueSpeed = 24 + comboEnergy * 120 + ballPulse * 90;
        ballHueShift = (ballHueShift + movementDelta * ballHueSpeed) % 360;

        context.ballHueFilter.reset();
        context.ballHueFilter.hue(ballHueShift, false);
        if (comboEnergy > 0.01) {
            context.ballHueFilter.saturate(1 + comboEnergy * 0.35, true);
        }

        const glowColor = mixColors(themeBallColors.highlight, themeAccents.combo, Math.min(1, comboEnergy * 0.75));
        context.ballGlowFilter.color = glowColor;
        context.ballGlowFilter.outerStrength = Math.min(5, 1.4 + comboEnergy * 0.8 + ballPulse * 2.6);

        visuals?.ballLight?.update({
            position: { x: ballBody.position.x, y: ballBody.position.y },
            speed: MatterVector.magnitude(ballBody.velocity),
            deltaSeconds: movementDelta,
        });

        const speedAfterRegulation = MatterVector.magnitude(ballBody.velocity);
        visuals?.ballSpeedRing?.update({
            position: { x: ballBody.position.x, y: ballBody.position.y },
            speed: speedAfterRegulation,
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
            deltaSeconds: movementDelta,
        });
    };

    const updateBloomEffect = (params: VisualEffectsUpdateParams): void => {
        const { visuals, bloomAccentColor } = context;
        const { deltaSeconds, comboEnergy } = params;

        const bloomEnergy = clampUnit(comboEnergy);
        visuals?.comboBloomEffect?.update({
            comboEnergy: bloomEnergy,
            deltaSeconds,
            accentColor: bloomAccentColor,
        });
    };

    const updateBackgroundLayer = (params: VisualEffectsUpdateParams): void => {
        const { visuals, ballBody, backgroundAccentColor, themeBallColors, playfieldWidth, playfieldHeight } = context;
        const { deltaSeconds, comboEnergy } = params;

        const backgroundLayer = visuals?.playfieldBackground;
        if (!backgroundLayer) return;

        const comboTint = mixColors(backgroundAccentColor, themeBallColors.aura, Math.min(0.45, comboEnergy * 0.35));
        const accentMix = clampUnit(0.2 + comboEnergy * 0.5);
        backgroundLayer.setTint(comboTint, { accentMix });

        const normalizedBallX = playfieldWidth > 0
            ? clampUnit(ballBody.position.x / playfieldWidth)
            : 0.5;
        const normalizedBallY = playfieldHeight > 0
            ? clampUnit(ballBody.position.y / playfieldHeight)
            : 0.5;
        const parallaxIntensity = clampUnit(0.3 + comboEnergy * 0.5);
        backgroundLayer.setParallaxTarget(
            { x: normalizedBallX, y: normalizedBallY },
            { intensity: parallaxIntensity },
        );
        backgroundLayer.update(deltaSeconds);
    };

    const updateTrailEffects = (params: VisualEffectsUpdateParams): void => {
        const { visuals } = context;
        const { deltaSeconds, comboEnergy, ballTrailSources, chromaticTrailSources } = params;

        const ballTrailsEffect = visuals?.ballTrailsEffect;
        if (ballTrailsEffect && ballTrailSources) {
            ballTrailsEffect.update({
                deltaSeconds,
                comboEnergy,
                sources: ballTrailSources,
            });
        }

        const chromaticTrailEffect = visuals?.chromaticTrailEffect;
        if (chromaticTrailEffect) {
            chromaticTrailEffect.update({
                deltaSeconds,
                comboEnergy,
                sources: chromaticTrailSources ?? [],
            });
        }
    };

    const updateDistortionEffects = (params: VisualEffectsUpdateParams): void => {
        const { visuals } = context;
        const { deltaSeconds, comboEnergy, heatDistortionSources } = params;

        const heatDistortionEffect = visuals?.heatDistortionEffect;
        if (heatDistortionEffect && heatDistortionSources) {
            heatDistortionEffect.update({
                deltaSeconds,
                comboEnergy,
                sources: heatDistortionSources,
            });
        }

        visuals?.heatRippleEffect?.update(deltaSeconds);
    };

    const updateEchoAndVortexEffects = (params: VisualEffectsUpdateParams): void => {
        const { visuals } = context;
        const { deltaSeconds, echoTrails, vortexFields } = params;

        const echoTrailEffect = visuals?.echoTrailEffect;
        if (echoTrailEffect && echoTrails) {
            echoTrailEffect.update({
                deltaSeconds,
                echoes: echoTrails,
            });
        }

        const vortexFieldEffect = visuals?.vortexFieldEffect;
        if (vortexFieldEffect && vortexFields) {
            vortexFieldEffect.update({
                deltaSeconds,
                vortices: vortexFields,
            });
        }
    };

    const updateDebugOverlays = (): void => {
        const { visuals } = context;

        const inputOverlay = visuals?.inputDebugOverlay;
        if (inputOverlay?.isVisible()) {
            inputOverlay.update();
        }

        const physicsOverlay = visuals?.physicsDebugOverlay;
        if (physicsOverlay?.isVisible() && state.lastPhysicsDebugState) {
            physicsOverlay.update(state.lastPhysicsDebugState);
        }
    };

    const decayPulses = (deltaSeconds: number): void => {
        state.ballGlowPulse = Math.max(0, state.ballGlowPulse - deltaSeconds * 1.6);
        state.paddleGlowPulse = Math.max(0, state.paddleGlowPulse - deltaSeconds * 1.3);
        state.comboRingPulse = Math.max(0, state.comboRingPulse - deltaSeconds * 1.05);
    };

    const update = (params: VisualEffectsUpdateParams): void => {
        const { deltaSeconds } = params;
        const movementDelta = deltaSeconds;

        context.visuals?.brickParticles?.update(deltaSeconds);

        updateComboRing(params, movementDelta);
        updateBallEffects(params, movementDelta);
        updateBloomEffect(params);
        updateBackgroundLayer(params);
        updateTrailEffects(params);
        updateDistortionEffects(params);
        updateEchoAndVortexEffects(params);

        context.multiBallController.updateSpeedIndicators({
            baseSpeed: params.currentBaseSpeed,
            maxSpeed: params.currentMaxSpeed,
            deltaSeconds: movementDelta,
        });

        decayPulses(deltaSeconds);
        updateDebugOverlays();
    };

    return {
        state,
        update,
        updateBallHue,
    };
};
