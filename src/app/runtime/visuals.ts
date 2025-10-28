import { Container } from 'pixi.js';
import { GameTheme } from 'render/theme';
import { createPlayfieldBackgroundLayer } from 'render/playfield-visuals';
import {
    createEffectRegistry,
    createAudioWaveBackdrop,
    type AudioWaveBackdrop,
    createBallTrailsEffect,
    type BallTrailSource,
    createBrickParticleSystem,
    type BrickParticleSystem,
    createComboBloomEffect,
    createDynamicLight,
    createHeatDistortionEffect,
    type HeatDistortionSource,
    createHeatRippleEffect,
    createRoundCountdown,
    type RoundCountdownDisplay,
    createSpeedRing,
} from 'render/effects';
import { createComboRing } from 'render/combo-ring';
import { InputDebugOverlay, PhysicsDebugOverlay } from 'render/debug-overlay';
import type { StageHandle } from 'render/stage';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { GameInputManager } from 'input/input-manager';
import type { PaddleBodyController } from 'render/paddle-body';
import type { BallAttachmentController } from 'physics/ball-attachment';
import type { RandomManager } from 'util/random';
import type { MultiBallColors } from '../multi-ball-controller';

export type ForeshadowInstrument = 'melodic' | 'percussion';

export interface RuntimeVisualsDeps {
    stage: StageHandle;
    playfieldDimensions: { width: number; height: number };
    themeBallColors: MultiBallColors;
    themeAccents: { combo: number; powerUp: number };
    random: RandomManager;
    ball: Ball;
    paddle: Paddle;
    ballController: BallAttachmentController;
    paddleController: PaddleBodyController;
    inputManager: GameInputManager;
    ballMaxSpeed: number;
}

export interface RuntimeVisuals {
    readonly playfieldBackground: ReturnType<typeof createPlayfieldBackgroundLayer> | null;
    readonly audioWaveBackdrop: AudioWaveBackdrop | null;
    readonly comboBloomEffect: ReturnType<typeof createComboBloomEffect> | null;
    readonly ballTrailsEffect: ReturnType<typeof createBallTrailsEffect> | null;
    readonly heatDistortionEffect: ReturnType<typeof createHeatDistortionEffect> | null;
    readonly heatRippleEffect: ReturnType<typeof createHeatRippleEffect> | null;
    readonly brickParticles: BrickParticleSystem | null;
    readonly roundCountdownDisplay: RoundCountdownDisplay | null;
    readonly comboRing: ReturnType<typeof createComboRing>;
    readonly gameContainer: Container;
    readonly ballSpeedRing: ReturnType<typeof createSpeedRing> | null;
    readonly ballLight: ReturnType<typeof createDynamicLight> | null;
    readonly paddleLight: ReturnType<typeof createDynamicLight> | null;
    readonly inputDebugOverlay: InputDebugOverlay | null;
    readonly physicsDebugOverlay: PhysicsDebugOverlay | null;
    readonly ballTrailSources: BallTrailSource[];
    readonly heatDistortionSources: HeatDistortionSource[];
    replacePaddleLight(color: number): void;
    dispose(): void;
}

export const createRuntimeVisuals = ({
    stage,
    playfieldDimensions,
    themeBallColors,
    themeAccents,
    random,
    ball,
    paddle,
    ballController,
    paddleController,
    inputManager,
    ballMaxSpeed,
}: RuntimeVisualsDeps): RuntimeVisuals => {
    const ballTrailSources: BallTrailSource[] = [];
    const heatDistortionSources: HeatDistortionSource[] = [];
    const effects = createEffectRegistry();

    const removeFromParent = (display: { removeFromParent?: () => void; parent?: { removeChild(child: unknown): unknown } | null }) => {
        if (typeof display.removeFromParent === 'function') {
            display.removeFromParent();
        } else if (display.parent && typeof display.parent.removeChild === 'function') {
            display.parent.removeChild(display as never);
        }
    };

    const attachPlayfieldFilter = (filter: unknown) => {
        const existing = stage.layers.playfield.filters;
        const filters = existing ? existing.slice() : [];
        if (!filters.includes(filter as never)) {
            filters.push(filter as never);
            stage.layers.playfield.filters = filters;
        }
    };

    const detachPlayfieldFilter = (filter: unknown) => {
        const existing = stage.layers.playfield.filters;
        if (!existing) {
            return;
        }
        const next = existing.filter((entry) => entry !== filter);
        stage.layers.playfield.filters = next.length > 0 ? next : null;
    };

    const playfieldBackground = createPlayfieldBackgroundLayer(playfieldDimensions);
    stage.addToLayer('playfield', playfieldBackground.container);
    effects.trackContainer(playfieldBackground.container, { destroy: { children: true } });

    const audioWaveBackdrop = effects.track(
        createAudioWaveBackdrop({
            width: playfieldDimensions.width,
            height: playfieldDimensions.height,
        }),
        (backdrop) => {
            removeFromParent(backdrop.container);
            backdrop.destroy();
        },
    );
    audioWaveBackdrop.container.zIndex = 2;
    audioWaveBackdrop.setVisible(false);
    stage.addToLayer('playfield', audioWaveBackdrop.container);

    const comboBloomEffect = effects.track(
        createComboBloomEffect({ baseColor: themeAccents.combo }),
        (effect) => {
            detachPlayfieldFilter(effect.filter);
            effect.destroy();
        },
    );
    attachPlayfieldFilter(comboBloomEffect.filter);

    const ballTrailsEffect = effects.track(
        createBallTrailsEffect({
            coreColor: themeBallColors.core,
            auraColor: themeBallColors.aura,
            accentColor: themeAccents.combo,
        }),
        (effect) => {
            removeFromParent(effect.container);
            effect.destroy();
        },
    );
    stage.addToLayer('effects', ballTrailsEffect.container);

    const heatDistortionEffect = effects.track(
        createHeatDistortionEffect(),
        (effect) => {
            detachPlayfieldFilter(effect.filter);
            effect.destroy();
        },
    );
    attachPlayfieldFilter(heatDistortionEffect.filter);

    const heatRippleEffect = effects.track(
        createHeatRippleEffect(),
        (effect) => {
            detachPlayfieldFilter(effect.filter);
            effect.destroy();
        },
    );
    attachPlayfieldFilter(heatRippleEffect.filter);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
        const globalRef = window as typeof window & {
            __LBHeatRipple?: { getActiveRippleCount: () => number };
        };
        globalRef.__LBHeatRipple = {
            getActiveRippleCount: () => heatRippleEffect.getActiveRippleCount(),
        };
    }

    const brickParticles = effects.track(
        createBrickParticleSystem({
            random: random.random,
        }),
        (system) => {
            removeFromParent(system.container);
            system.destroy();
        },
    );
    brickParticles.container.zIndex = 42;
    stage.addToLayer('effects', brickParticles.container);

    const roundCountdownDisplay = createRoundCountdown({
        playfieldSize: playfieldDimensions,
        theme: GameTheme,
    });
    stage.addToLayer('playfield', roundCountdownDisplay.container);
    effects.trackContainer(roundCountdownDisplay.container, { destroy: { children: true } });

    const gameContainer = new Container();
    gameContainer.zIndex = 10;
    gameContainer.visible = false;
    gameContainer.sortableChildren = true;
    stage.addToLayer('playfield', gameContainer);
    effects.trackContainer(gameContainer, { destroy: { children: true } });

    const ballLightSetup = createDynamicLight({
        speedForMaxIntensity: ballMaxSpeed * 1.1,
    });
    ballLightSetup.container.zIndex = 5;
    stage.addToLayer('effects', ballLightSetup.container);
    const ballLight = effects.track(ballLightSetup, (light) => {
        removeFromParent(light.container);
        light.destroy();
    });

    const buildPaddleLight = (color: number) => {
        const handle = createDynamicLight({
            color,
            minRadius: 140,
            maxRadius: 140,
            baseRadius: 140,
            minIntensity: 0,
            maxIntensity: 0,
            speedForMaxIntensity: Number.POSITIVE_INFINITY,
            radiusLerpSpeed: 6,
            intensityLerpSpeed: 5,
        });
        handle.container.zIndex = 4;
        handle.container.alpha = 0.9;
        stage.addToLayer('effects', handle.container);
        return effects.track(handle, (light) => {
            removeFromParent(light.container);
            light.destroy();
        });
    };

    let paddleLight: ReturnType<typeof createDynamicLight> | null = buildPaddleLight(themeAccents.powerUp);

    const comboRingSetup = createComboRing(stage.app.renderer);
    comboRingSetup.container.zIndex = 40;
    gameContainer.addChild(comboRingSetup.container);
    const comboRing = effects.track(comboRingSetup, (ring) => {
        removeFromParent(ring.container);
        ring.dispose();
    });

    const ballSpeedRingSetup = createSpeedRing({
        minRadius: ball.radius + 6,
        maxRadius: ball.radius + 28,
        haloRadiusOffset: 14,
        ringThickness: 3,
        palette: {
            ringColor: themeBallColors.highlight,
            haloColor: themeBallColors.aura,
        },
    });
    ballSpeedRingSetup.container.zIndex = 49;
    gameContainer.addChild(ballSpeedRingSetup.container);
    const ballSpeedRing = effects.track(ballSpeedRingSetup, (ring) => {
        removeFromParent(ring.container);
        ring.destroy();
    });

    const inputDebugOverlaySetup = new InputDebugOverlay({
        inputManager,
        paddleController,
        ballController,
        paddle,
        ball,
        stage,
    });
    stage.layers.hud.addChild(inputDebugOverlaySetup.getContainer());
    const inputDebugOverlay = effects.track(inputDebugOverlaySetup, (overlay) => {
        const inputContainer = overlay.getContainer();
        removeFromParent(inputContainer);
        overlay.destroy();
    });

    const physicsDebugOverlaySetup = new PhysicsDebugOverlay();
    stage.layers.hud.addChild(physicsDebugOverlaySetup.getContainer());
    physicsDebugOverlaySetup.setVisible(false);
    const physicsDebugOverlay = effects.track(physicsDebugOverlaySetup, (overlay) => {
        const container = overlay.getContainer();
        removeFromParent(container);
        overlay.destroy();
    });

    const replacePaddleLight = (color: number) => {
        if (paddleLight) {
            removeFromParent(paddleLight.container);
            paddleLight.destroy();
        }
        paddleLight = buildPaddleLight(color);
    };

    const dispose = () => {
        effects.disposeAll();
        paddleLight = null;
        if (import.meta.env.DEV && typeof window !== 'undefined') {
            const globalRef = window as typeof window & {
                __LBHeatRipple?: { getActiveRippleCount: () => number };
            };
            if (globalRef.__LBHeatRipple) {
                delete globalRef.__LBHeatRipple;
            }
        }
        ballTrailSources.length = 0;
        heatDistortionSources.length = 0;
    };

    return {
        get playfieldBackground() {
            return playfieldBackground;
        },
        get audioWaveBackdrop() {
            return audioWaveBackdrop;
        },
        get comboBloomEffect() {
            return comboBloomEffect ?? null;
        },
        get ballTrailsEffect() {
            return ballTrailsEffect;
        },
        get heatDistortionEffect() {
            return heatDistortionEffect ?? null;
        },
        get heatRippleEffect() {
            return heatRippleEffect;
        },
        get brickParticles() {
            return brickParticles;
        },
        get roundCountdownDisplay() {
            return roundCountdownDisplay;
        },
        get comboRing() {
            return comboRing;
        },
        get gameContainer() {
            return gameContainer;
        },
        get ballSpeedRing() {
            return ballSpeedRing;
        },
        get ballLight() {
            return ballLight;
        },
        get paddleLight() {
            return paddleLight;
        },
        get inputDebugOverlay() {
            return inputDebugOverlay;
        },
        get physicsDebugOverlay() {
            return physicsDebugOverlay;
        },
        get ballTrailSources() {
            return ballTrailSources;
        },
        get heatDistortionSources() {
            return heatDistortionSources;
        },
        replacePaddleLight,
        dispose,
    } satisfies RuntimeVisuals;
};
