import { afterEach, describe, expect, it } from 'vitest';
import { GameTheme, getActiveThemeName, onThemeChange, setActiveTheme } from 'render/theme';

describe('theme registry', () => {
    const resetTheme = () => {
        setActiveTheme('default');
    };

    afterEach(() => {
        resetTheme();
    });

    it('notifies listeners and updates proxy when active theme changes', () => {
        resetTheme();
        const defaultPalette = [...GameTheme.brickColors];
        const events: string[] = [];

        const unsubscribe = onThemeChange((_theme, name) => {
            events.push(name);
        });

        setActiveTheme('colorBlind');

        expect(getActiveThemeName()).toBe('colorBlind');
        expect(events).toEqual(['colorBlind']);
        expect(GameTheme.brickColors).not.toEqual(defaultPalette);

        unsubscribe();

        setActiveTheme('default');
        expect(getActiveThemeName()).toBe('default');
        expect(GameTheme.brickColors).toEqual(defaultPalette);
    });
});
