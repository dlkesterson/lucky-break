import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameTheme } from 'ui/hooks/useGameTheme';
import type { GameThemeDefinition, ThemeName } from 'render/theme';

const createMockTheme = (accent: string): GameThemeDefinition => ({
    background: { from: '#000000', to: '#010101', starAlpha: 0 },
    brickColors: ['#ffffff'],
    paddle: { gradient: ['#000000', '#111111'], glow: 0 },
    ball: { core: accent, aura: accent, highlight: '#ffffff' },
    font: 'mock-font',
    monoFont: 'mock-mono',
    hud: {
        panelFill: '#000000',
        panelLine: '#000000',
        textPrimary: '#ffffff',
        textSecondary: '#dddddd',
        accent,
        danger: '#ff0000',
    },
    accents: {
        combo: '#00ff00',
        powerUp: '#0000ff',
    },
});

const initialTheme = createMockTheme('#223344');
const themeListeners: ((theme: GameThemeDefinition, name: ThemeName) => void)[] = [];

vi.mock('render/theme', () => ({
    getActiveTheme: () => initialTheme,
    getActiveThemeName: () => 'default' as ThemeName,
    onThemeChange: (listener: (theme: GameThemeDefinition, name: ThemeName) => void) => {
        themeListeners.push(listener);
        return () => {
            const index = themeListeners.indexOf(listener);
            if (index >= 0) {
                themeListeners.splice(index, 1);
            }
        };
    },
}));

const emitThemeChange = (theme: GameThemeDefinition, name: ThemeName) => {
    [...themeListeners].forEach((listener) => listener(theme, name));
};

const ThemeViewer = () => {
    const snapshot = useGameTheme();
    return createElement('div', {
        'data-testid': 'theme-viewer',
        'data-theme-name': snapshot.name,
        'data-accent': snapshot.theme.hud.accent,
    });
};

describe('useGameTheme', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderViewer = async () => {
        await act(async () => {
            root.render(createElement(ThemeViewer));
        });
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        themeListeners.splice(0, themeListeners.length);
    });

    it('provides the active theme snapshot on mount', async () => {
        await renderViewer();

        const viewer = container.querySelector<HTMLElement>('[data-testid="theme-viewer"]');
        expect(viewer?.dataset.themeName).toBe('default');
        expect(viewer?.dataset.accent).toBe('#223344');
    });

    it('updates when the theme change event fires', async () => {
        await renderViewer();
        const viewer = container.querySelector<HTMLElement>('[data-testid="theme-viewer"]');
        expect(viewer).not.toBeNull();

        await act(async () => {
            emitThemeChange(createMockTheme('#ff00aa'), 'colorBlind');
        });

        const updatedViewer = container.querySelector<HTMLElement>('[data-testid="theme-viewer"]');
        expect(updatedViewer?.dataset.themeName).toBe('colorBlind');
        expect(updatedViewer?.dataset.accent).toBe('#ff00aa');
    });

    it('cleans up the listener on unmount', async () => {
        await renderViewer();
        expect(themeListeners).toHaveLength(1);

        act(() => {
            root.unmount();
        });

        expect(themeListeners).toHaveLength(0);
    });
});
