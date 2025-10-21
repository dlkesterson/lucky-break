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
    background: { from: '#160B27', to: '#2B1140', starAlpha: 0.18 },
    brickColors: ['#F3443C', '#FF8A34', '#FFD04A', '#95D146'],
    paddle: { gradient: ['#4CB7FF', '#1E3F9A'], glow: 0.48 },
    ball: { core: '#F8F4DD', aura: '#FFF2D7', highlight: '#FFFFFF' },
    font: 'Luckiest Guy, Overpass, sans-serif',
    monoFont: 'Overpass Mono, monospace',
    hud: {
        panelFill: '#1A1230',
        panelLine: '#FF8A34',
        textPrimary: '#FFEFD9',
        textSecondary: '#FFCE63',
        accent: '#FFD04A',
        danger: '#F3443C',
    },
    accents: {
        combo: '#FFD04A',
        powerUp: '#FF6B35',
    },
} as const;

export type GameTheme = typeof GameTheme;
