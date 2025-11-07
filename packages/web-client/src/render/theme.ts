import {
    THEME_REGISTRY as IMPORTED_THEME_REGISTRY,
    THEME_OPTIONS as IMPORTED_THEME_OPTIONS,
    type GameThemeDefinition,
    type ThemeName,
    type ThemeOption,
} from '@lucky-break/design-system';

export type { GameThemeDefinition, ThemeName, ThemeOption };

type ThemeChangeListener = (theme: GameThemeDefinition, name: ThemeName) => void;

const THEME_STORAGE_KEY = 'lucky-break.theme';

const THEME_REGISTRY: Record<ThemeName, GameThemeDefinition> = IMPORTED_THEME_REGISTRY;

const THEME_OPTIONS: readonly ThemeOption[] = IMPORTED_THEME_OPTIONS;

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
