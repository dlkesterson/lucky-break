export interface GameThemeDefinition {
    readonly background: {
        readonly from: string;
        readonly to: string;
        readonly starAlpha: number;
    };
    readonly brickColors: readonly string[];
    readonly paddle: {
        readonly gradient: readonly string[];
        readonly glow: number;
    };
    readonly ball: {
        readonly core: string;
        readonly aura: string;
        readonly highlight: string;
    };
    readonly font: string;
    readonly monoFont: string;
    readonly hud: {
        readonly panelFill: string;
        readonly panelLine: string;
        readonly textPrimary: string;
        readonly textSecondary: string;
        readonly accent: string;
        readonly danger: string;
    };
    readonly accents: {
        readonly combo: string;
        readonly powerUp: string;
    };
}

export const GameTheme: GameThemeDefinition = {
    background: { from: '#06081A', to: '#0E1B2B', starAlpha: 0.15 },
    brickColors: ['#00E0FF', '#0090FF', '#A000FF'],
    paddle: { gradient: ['#00FFA8', '#00C9FF'], glow: 0.4 },
    ball: { core: '#FF4F81', aura: '#FFE6EB', highlight: '#FF99BD' },
    font: 'Overpass, sans-serif',
    monoFont: 'Overpass Mono, monospace',
    hud: {
        panelFill: '#081226',
        panelLine: '#1D9FFF',
        textPrimary: '#F2FBFF',
        textSecondary: '#80E8FF',
        accent: '#FFE164',
        danger: '#FF6B8B',
    },
    accents: {
        combo: '#FFE164',
        powerUp: '#7CFFEB',
    },
} as const;

export type GameTheme = typeof GameTheme;
