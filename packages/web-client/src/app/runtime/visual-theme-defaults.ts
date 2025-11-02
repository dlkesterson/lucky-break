import {
    toColorNumber,
    mixColors,
    type BallVisualDefaults,
    type PaddleVisualDefaults,
} from 'render/playfield-visuals';
import type { GameThemeDefinition } from 'render/theme';
import type { MultiBallColors } from '../multi-ball-controller';
import type { MetaUpgradeLoadout } from '../meta-upgrades';

const DEFAULT_BALL_VISUALS: BallVisualDefaults = {
    baseColor: 0xffffff,
    auraColor: 0xffffff,
    highlightColor: 0xffffff,
    baseAlpha: 0.78,
    rimAlpha: 0.38,
    innerAlpha: 0.32,
    innerScale: 0.5,
};

const DEFAULT_PADDLE_VISUALS: PaddleVisualDefaults = {
    gradient: [0xffffff, 0xffffff],
    accentColor: 0xffffff,
};

export interface VisualThemeDefaultsOptions {
    readonly initialTheme: GameThemeDefinition;
    readonly getMetaLoadout: () => MetaUpgradeLoadout;
}

export interface VisualThemeSnapshot {
    readonly rowColors: readonly number[];
    readonly ballColors: MultiBallColors;
    readonly ballDefaults: BallVisualDefaults;
    readonly paddleDefaults: PaddleVisualDefaults;
    readonly accents: { readonly combo: number; readonly powerUp: number };
    readonly backgroundAccentColor: number;
    readonly bloomAccentColor: number;
    readonly backgroundAccentPalette: readonly number[];
    readonly backgroundAccentIndex: number;
}

const toColorValue = (value: string | number | undefined, fallback: string | number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.length > 0) {
        return toColorNumber(value);
    }
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
        return fallback;
    }
    if (typeof fallback === 'string' && fallback.length > 0) {
        return toColorNumber(fallback);
    }
    return 0xffffff;
};

const cloneBallDefaults = (defaults: BallVisualDefaults): BallVisualDefaults => ({
    baseColor: defaults.baseColor,
    auraColor: defaults.auraColor,
    highlightColor: defaults.highlightColor,
    baseAlpha: defaults.baseAlpha,
    rimAlpha: defaults.rimAlpha,
    innerAlpha: defaults.innerAlpha,
    innerScale: defaults.innerScale,
});

const clonePaddleDefaults = (defaults: PaddleVisualDefaults): PaddleVisualDefaults => ({
    gradient: [...defaults.gradient],
    accentColor: defaults.accentColor,
});

export interface VisualThemeDefaults {
    applyTheme: (theme: GameThemeDefinition) => VisualThemeSnapshot;
    cycleBackgroundAccent: (delta: number) => VisualThemeSnapshot;
    getSnapshot: () => VisualThemeSnapshot;
}

export const createVisualThemeDefaults = ({
    initialTheme,
    getMetaLoadout,
}: VisualThemeDefaultsOptions): VisualThemeDefaults => {
    let rowColors: readonly number[] = [];
    let ballColors: MultiBallColors = {
        core: DEFAULT_BALL_VISUALS.baseColor,
        aura: DEFAULT_BALL_VISUALS.auraColor,
        highlight: DEFAULT_BALL_VISUALS.highlightColor,
    } satisfies MultiBallColors;
    let ballDefaults: BallVisualDefaults = cloneBallDefaults(DEFAULT_BALL_VISUALS);
    let paddleDefaults: PaddleVisualDefaults = clonePaddleDefaults(DEFAULT_PADDLE_VISUALS);
    let accents: { combo: number; powerUp: number } = {
        combo: DEFAULT_PADDLE_VISUALS.accentColor,
        powerUp: DEFAULT_PADDLE_VISUALS.accentColor,
    };
    let backgroundAccentPalette: number[] = [DEFAULT_PADDLE_VISUALS.accentColor];
    let backgroundAccentIndex = 0;
    let backgroundAccentColor = backgroundAccentPalette[0];
    let bloomAccentColor = backgroundAccentColor;
    let currentSnapshot: VisualThemeSnapshot = {
        rowColors,
        ballColors,
        ballDefaults,
        paddleDefaults,
        accents,
        backgroundAccentColor,
        bloomAccentColor,
        backgroundAccentPalette,
        backgroundAccentIndex,
    } satisfies VisualThemeSnapshot;

    const rebuildBackgroundPalette = (): void => {
        if (backgroundAccentPalette.length === 0) {
            backgroundAccentPalette = [0xffffff];
        }
        if (backgroundAccentIndex >= backgroundAccentPalette.length) {
            backgroundAccentIndex = backgroundAccentPalette.length > 0
                ? backgroundAccentIndex % backgroundAccentPalette.length
                : 0;
        }
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex] ?? accents.combo;
        bloomAccentColor = backgroundAccentColor;
    };

    const buildSnapshot = (): VisualThemeSnapshot => ({
        rowColors,
        ballColors: { ...ballColors },
        ballDefaults: cloneBallDefaults(ballDefaults),
        paddleDefaults: clonePaddleDefaults(paddleDefaults),
        accents: { ...accents },
        backgroundAccentColor,
        bloomAccentColor,
        backgroundAccentPalette: [...backgroundAccentPalette],
        backgroundAccentIndex,
    });

    const applyTheme = (theme: GameThemeDefinition): VisualThemeSnapshot => {
        const loadout = getMetaLoadout();
        const palette = loadout.visualPalette;

        rowColors = theme.brickColors.map((color) => toColorNumber(color));

        ballColors = {
            core: toColorValue(palette.ball?.core, theme.ball.core),
            aura: toColorValue(palette.ball?.aura, theme.ball.aura),
            highlight: toColorValue(palette.ball?.highlight, theme.ball.highlight),
        } satisfies MultiBallColors;

        ballDefaults = {
            baseColor: ballColors.core,
            auraColor: ballColors.aura,
            highlightColor: ballColors.highlight,
            baseAlpha: palette.ball?.baseAlpha ?? DEFAULT_BALL_VISUALS.baseAlpha,
            rimAlpha: palette.ball?.rimAlpha ?? DEFAULT_BALL_VISUALS.rimAlpha,
            innerAlpha: palette.ball?.innerAlpha ?? DEFAULT_BALL_VISUALS.innerAlpha,
            innerScale: palette.ball?.innerScale ?? DEFAULT_BALL_VISUALS.innerScale,
        } satisfies BallVisualDefaults;

        paddleDefaults = {
            gradient: (palette.paddle?.gradient ?? theme.paddle.gradient).map((entry) =>
                toColorValue(entry, DEFAULT_PADDLE_VISUALS.accentColor),
            ),
            accentColor: toColorValue(palette.paddle?.accentColor, theme.accents.combo),
        } satisfies PaddleVisualDefaults;

        accents = {
            combo: toColorValue(palette.accents?.combo, theme.accents.combo),
            powerUp: toColorValue(palette.accents?.powerUp, theme.accents.powerUp),
        };

        const backgroundOverrides = palette.accents?.background ?? null;
        if (backgroundOverrides && backgroundOverrides.length > 0) {
            backgroundAccentPalette = backgroundOverrides.map((entry) =>
                toColorValue(entry, accents.combo),
            );
        } else {
            const fallback = [
                accents.combo,
                ballColors.aura,
                mixColors(accents.powerUp, ballColors.highlight, 0.45),
            ];
            backgroundAccentPalette = fallback;
        }

        rebuildBackgroundPalette();
        currentSnapshot = buildSnapshot();
        return currentSnapshot;
    };

    const cycleBackgroundAccent = (delta: number): VisualThemeSnapshot => {
        if (backgroundAccentPalette.length === 0) {
            rebuildBackgroundPalette();
            currentSnapshot = buildSnapshot();
            return currentSnapshot;
        }

        const length = backgroundAccentPalette.length;
        backgroundAccentIndex = ((backgroundAccentIndex + delta) % length + length) % length;
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex] ?? accents.combo;
        bloomAccentColor = backgroundAccentColor;
        currentSnapshot = buildSnapshot();
        return currentSnapshot;
    };

    const getSnapshot = (): VisualThemeSnapshot => currentSnapshot;

    currentSnapshot = applyTheme(initialTheme);

    return {
        applyTheme,
        cycleBackgroundAccent,
        getSnapshot,
    } satisfies VisualThemeDefaults;
};
