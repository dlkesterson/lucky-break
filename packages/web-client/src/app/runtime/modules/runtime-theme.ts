import type { GameThemeDefinition } from 'render/theme';
import type { VisualFactoryHandle } from 'render/visual-factory';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { GlowFilter } from '@pixi/filter-glow';
import type { BallVisualPalette } from 'render/playfield-visuals';
import type { Graphics } from 'pixi.js';
import type { MultiBallController } from '../../multi-ball-controller';
import type { StageHandle } from 'render/stage';
import type { RuntimeVisuals } from '../physics-assembly';
import type { VisualThemeDefaults, VisualThemeSnapshot } from '../visual-theme-defaults';
import { deriveChromaticTrailPalette } from 'render/effects/chromatic-trail-palette';

export interface RuntimeThemeCoordinatorOptions {
    readonly defaults: VisualThemeDefaults;
    readonly initialTheme: GameThemeDefinition;
    readonly levelRuntime: {
        setRowColors(colors: readonly number[]): void;
    };
    readonly reapplyGambleAppearances: () => void;
    readonly visualFactory: VisualFactoryHandle;
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly ballGraphics: Graphics;
    readonly paddleGraphics: Graphics;
    readonly ballGlowFilter: GlowFilter;
    readonly multiBallController: MultiBallController;
    readonly stage: StageHandle;
    readonly visualsProvider: () => RuntimeVisuals | null;
    readonly renderStageSoon: () => void;
}

export interface RuntimeThemeCoordinator {
    getSnapshot(): VisualThemeSnapshot;
    subscribe(listener: (snapshot: VisualThemeSnapshot) => void): () => void;
    applyTheme(theme: GameThemeDefinition): void;
    cycleBackgroundAccent(delta: number): void;
    setBallPaletteOverride(override: Partial<BallVisualPalette> | null): void;
}

export const createRuntimeThemeCoordinator = ({
    defaults,
    initialTheme,
    levelRuntime,
    reapplyGambleAppearances,
    visualFactory,
    ball,
    paddle,
    ballGraphics,
    paddleGraphics,
    ballGlowFilter,
    multiBallController,
    stage,
    visualsProvider,
    renderStageSoon,
}: RuntimeThemeCoordinatorOptions): RuntimeThemeCoordinator => {
    let currentTheme: GameThemeDefinition = initialTheme;
    let baseSnapshot = defaults.getSnapshot();
    let snapshot: VisualThemeSnapshot = baseSnapshot;
    const listeners = new Set<(next: VisualThemeSnapshot) => void>();
    let ballPaletteOverride: Partial<BallVisualPalette> | null = null;

    const overridesEqual = (
        left: Partial<BallVisualPalette> | null,
        right: Partial<BallVisualPalette> | null,
    ): boolean => {
        if (!left && !right) {
            return true;
        }
        if (!left || !right) {
            return false;
        }
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        for (const key of keys) {
            if ((left as Record<string, unknown>)[key] !== (right as Record<string, unknown>)[key]) {
                return false;
            }
        }
        return true;
    };

    const hasMeaningfulOverride = (): boolean => {
        if (!ballPaletteOverride) {
            return false;
        }
        return Object.values(ballPaletteOverride).some((value) => value !== undefined);
    };

    const applyOverrides = (input: VisualThemeSnapshot): VisualThemeSnapshot => {
        if (!hasMeaningfulOverride()) {
            return input;
        }
        const override = ballPaletteOverride!;
        const ballDefaults = {
            ...input.ballDefaults,
            baseColor: override.baseColor ?? input.ballDefaults.baseColor,
            baseAlpha: override.baseAlpha ?? input.ballDefaults.baseAlpha,
            auraColor: override.innerColor ?? input.ballDefaults.auraColor,
            innerAlpha: override.innerAlpha ?? input.ballDefaults.innerAlpha,
            innerScale: override.innerScale ?? input.ballDefaults.innerScale,
            highlightColor: override.rimColor ?? input.ballDefaults.highlightColor,
            rimAlpha: override.rimAlpha ?? input.ballDefaults.rimAlpha,
            shape: override.shape ?? input.ballDefaults.shape,
        } satisfies VisualThemeSnapshot['ballDefaults'];

        return {
            ...input,
            ballDefaults,
            ballColors: {
                core: ballDefaults.baseColor,
                aura: ballDefaults.auraColor,
                highlight: ballDefaults.highlightColor,
            },
        } satisfies VisualThemeSnapshot;
    };

    const emitSnapshot = () => {
        for (const listener of listeners) {
            listener(snapshot);
        }
    };

    const applySnapshot = (next: VisualThemeSnapshot, updateBase = false) => {
        if (updateBase) {
            baseSnapshot = next;
        }
        snapshot = applyOverrides(next);
        const currentSnapshot = snapshot;
        levelRuntime.setRowColors(currentSnapshot.rowColors);
        reapplyGambleAppearances();
        visualFactory.ball.setDefaults(currentSnapshot.ballDefaults);
        visualFactory.paddle.setDefaults(currentSnapshot.paddleDefaults);
        ballGlowFilter.color = currentSnapshot.ballColors.highlight;

        const visuals = visualsProvider();

        visualFactory.ball.draw(ballGraphics, ball.radius);
        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height);
        multiBallController.applyTheme(currentSnapshot.ballColors);

        visuals?.roundCountdownDisplay?.setTheme(currentTheme);
        stage.applyTheme(currentTheme);

        visuals?.ballTrailsEffect?.applyTheme({
            coreColor: currentSnapshot.ballColors.core,
            auraColor: currentSnapshot.ballColors.aura,
            accentColor: currentSnapshot.accents.combo,
        });
        visuals?.chromaticTrailEffect?.applyPalette(
            deriveChromaticTrailPalette(currentSnapshot.ballColors, currentSnapshot.accents.combo),
        );
        visuals?.comboBloomEffect?.applyTheme(currentSnapshot.accents.combo);
        visuals?.replacePaddleLight(currentSnapshot.accents.powerUp);
        visuals?.ballSpeedRing?.setPalette({
            ringColor: currentSnapshot.ballColors.highlight,
            haloColor: currentSnapshot.ballColors.aura,
        });
        visuals?.playfieldBackground?.setTint(currentSnapshot.backgroundAccentColor, {
            immediate: true,
            accentMix: 0.2,
        });

        renderStageSoon();
        emitSnapshot();
    };

    applySnapshot(baseSnapshot);

    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            listener(snapshot);
            return () => {
                listeners.delete(listener);
            };
        },
        applyTheme(theme) {
            currentTheme = theme;
            const nextSnapshot = defaults.applyTheme(theme);
            applySnapshot(nextSnapshot, true);
        },
        cycleBackgroundAccent(delta) {
            const nextSnapshot = defaults.cycleBackgroundAccent(delta);
            applySnapshot(nextSnapshot, true);
        },
        setBallPaletteOverride(override) {
            const normalized = override && Object.values(override).some((value) => value !== undefined)
                ? { ...override }
                : null;
            if (overridesEqual(ballPaletteOverride, normalized)) {
                return;
            }
            ballPaletteOverride = normalized;
            applySnapshot(baseSnapshot);
        },
    } satisfies RuntimeThemeCoordinator;
};
