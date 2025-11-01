import type { GameThemeDefinition } from 'render/theme';
import type { VisualFactoryHandle } from 'render/visual-factory';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { GlowFilter } from '@pixi/filter-glow';
import type { Graphics } from 'pixi.js';
import type { MultiBallController } from '../../multi-ball-controller';
import type { HudDisplay } from 'render/hud-display';
import type { StageHandle } from 'render/stage';
import type { RuntimeVisuals } from '../physics-assembly';
import type { VisualThemeDefaults, VisualThemeSnapshot } from '../visual-theme-defaults';

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
    readonly hudDisplay: HudDisplay;
    readonly stage: StageHandle;
    readonly visualsProvider: () => RuntimeVisuals | null;
    readonly renderStageSoon: () => void;
}

export interface RuntimeThemeCoordinator {
    getSnapshot(): VisualThemeSnapshot;
    subscribe(listener: (snapshot: VisualThemeSnapshot) => void): () => void;
    applyTheme(theme: GameThemeDefinition): void;
    cycleBackgroundAccent(delta: number): void;
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
    hudDisplay,
    stage,
    visualsProvider,
    renderStageSoon,
}: RuntimeThemeCoordinatorOptions): RuntimeThemeCoordinator => {
    let currentTheme: GameThemeDefinition = initialTheme;
    let snapshot = defaults.getSnapshot();
    const listeners = new Set<(next: VisualThemeSnapshot) => void>();

    const emitSnapshot = () => {
        for (const listener of listeners) {
            listener(snapshot);
        }
    };

    const applySnapshot = (next: VisualThemeSnapshot) => {
        snapshot = next;
        levelRuntime.setRowColors(snapshot.rowColors);
        reapplyGambleAppearances();
        visualFactory.ball.setDefaults(snapshot.ballDefaults);
        visualFactory.paddle.setDefaults(snapshot.paddleDefaults);
        ballGlowFilter.color = snapshot.ballColors.highlight;

        const visuals = visualsProvider();

        visualFactory.ball.draw(ballGraphics, ball.radius);
        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height);
        multiBallController.applyTheme(snapshot.ballColors);

        hudDisplay.setTheme(currentTheme);
        visuals?.roundCountdownDisplay?.setTheme(currentTheme);
        stage.applyTheme(currentTheme);

        visuals?.ballTrailsEffect?.applyTheme({
            coreColor: snapshot.ballColors.core,
            auraColor: snapshot.ballColors.aura,
            accentColor: snapshot.accents.combo,
        });
        visuals?.comboBloomEffect?.applyTheme(snapshot.accents.combo);
        visuals?.replacePaddleLight(snapshot.accents.powerUp);
        visuals?.ballSpeedRing?.setPalette({
            ringColor: snapshot.ballColors.highlight,
            haloColor: snapshot.ballColors.aura,
        });
        visuals?.playfieldBackground?.setTint(snapshot.backgroundAccentColor, { immediate: true, accentMix: 0.2 });

        renderStageSoon();
        emitSnapshot();
    };

    applySnapshot(snapshot);

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
            applySnapshot(nextSnapshot);
        },
        cycleBackgroundAccent(delta) {
            const nextSnapshot = defaults.cycleBackgroundAccent(delta);
            applySnapshot(nextSnapshot);
        },
    } satisfies RuntimeThemeCoordinator;
};
