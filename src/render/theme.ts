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

export type ThemeName = 'default' | 'colorBlind';

export interface ThemeOption {
    readonly name: ThemeName;
    readonly label: string;
}

type ThemeChangeListener = (theme: GameThemeDefinition, name: ThemeName) => void;

const THEME_STORAGE_KEY = 'lucky-break.theme';

const deepFreeze = <T>(value: T): T => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }

    Object.getOwnPropertyNames(value).forEach((key) => {
        const property = (value as Record<string, unknown>)[key];
        deepFreeze(property);
    });
    return Object.freeze(value);
};

const createTheme = (definition: GameThemeDefinition): GameThemeDefinition => deepFreeze({
    ...definition,
    brickColors: [...definition.brickColors],
    paddle: { ...definition.paddle, gradient: [...definition.paddle.gradient] },
}) as GameThemeDefinition;

const DEFAULT_THEME = createTheme({
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
});

const COLOR_BLIND_THEME = createTheme({
    background: { from: '#081229', to: '#12315A', starAlpha: 0.22 },
    brickColors: ['#2E86AB', '#F18F01', '#F9C80E', '#1B998B'],
    paddle: { gradient: ['#F6C28B', '#3A1772'], glow: 0.52 },
    ball: { core: '#F5FBFF', aura: '#CDE7FF', highlight: '#FFFFFF' },
    font: 'Luckiest Guy, Overpass, sans-serif',
    monoFont: 'Overpass Mono, monospace',
    hud: {
        panelFill: '#0B1E35',
        panelLine: '#F18F01',
        textPrimary: '#F5FBFF',
        textSecondary: '#FAE589',
        accent: '#F18F01',
        danger: '#EF476F',
    },
    accents: {
        combo: '#FAE589',
        powerUp: '#2E86AB',
    },
});

const THEME_REGISTRY: Record<ThemeName, GameThemeDefinition> = {
    default: DEFAULT_THEME,
    colorBlind: COLOR_BLIND_THEME,
};

const THEME_OPTIONS: readonly ThemeOption[] = [
    { name: 'default', label: 'Vibrant' },
    { name: 'colorBlind', label: 'High Contrast' },
] as const;

const isThemeName = (value: string | null | undefined): value is ThemeName =>
    value === 'default' || value === 'colorBlind';

const resolveStorage = (): Storage | null => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (error) {
        void error;
    }
    return null;
};

const readStoredTheme = (): ThemeName | null => {
    const storage = resolveStorage();
    if (!storage) {
        return null;
    }
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : null;
};

const persistTheme = (name: ThemeName): void => {
    const storage = resolveStorage();
    if (!storage) {
        return;
    }
    try {
        storage.setItem(THEME_STORAGE_KEY, name);
    } catch (error) {
        void error;
    }
};

let activeThemeName: ThemeName = readStoredTheme() ?? 'default';
let activeTheme: GameThemeDefinition = THEME_REGISTRY[activeThemeName];

const listeners = new Set<ThemeChangeListener>();

const notifyThemeChange = (): void => {
    listeners.forEach((listener) => {
        listener(activeTheme, activeThemeName);
    });
};

const gameThemeProxy = new Proxy<GameThemeDefinition>({} as GameThemeDefinition, {
    get(_target, property) {
        return Reflect.get(activeTheme, property as keyof GameThemeDefinition);
    },
    ownKeys() {
        return Reflect.ownKeys(activeTheme);
    },
    getOwnPropertyDescriptor(_target, property) {
        return Reflect.getOwnPropertyDescriptor(activeTheme, property);
    },
});

export const GameTheme = gameThemeProxy;

export type GameTheme = typeof GameTheme;

export const getThemeOptions = (): readonly ThemeOption[] => THEME_OPTIONS;

export const getThemeLabel = (name: ThemeName): string =>
    THEME_OPTIONS.find((option) => option.name === name)?.label ?? name;

export const getActiveThemeName = (): ThemeName => activeThemeName;

export const getActiveTheme = (): GameThemeDefinition => activeTheme;

export const setActiveTheme = (name: ThemeName): void => {
    if (name === activeThemeName) {
        return;
    }
    activeThemeName = name;
    activeTheme = THEME_REGISTRY[activeThemeName];
    persistTheme(activeThemeName);
    notifyThemeChange();
};

export const toggleTheme = (name?: ThemeName): ThemeName => {
    const next = name ?? (activeThemeName === 'default' ? 'colorBlind' : 'default');
    setActiveTheme(next);
    return activeThemeName;
};

export const onThemeChange = (listener: ThemeChangeListener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
