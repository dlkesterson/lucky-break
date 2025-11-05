import { useEffect, useState } from 'react';
import {
    getActiveTheme,
    getActiveThemeName,
    onThemeChange,
    type GameThemeDefinition,
    type ThemeName,
} from 'render/theme';

interface ThemeSnapshot {
    readonly theme: GameThemeDefinition;
    readonly name: ThemeName;
}

export const useGameTheme = (): ThemeSnapshot => {
    const [snapshot, setSnapshot] = useState<ThemeSnapshot>(() => ({
        theme: getActiveTheme(),
        name: getActiveThemeName(),
    }));

    useEffect(() => {
        let cancelled = false;
        const unsubscribe = onThemeChange((nextTheme, name) => {
            if (cancelled) {
                return;
            }
            setSnapshot({ theme: nextTheme, name });
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    return snapshot;
};
