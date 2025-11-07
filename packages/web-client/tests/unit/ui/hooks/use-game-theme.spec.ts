import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameTheme } from 'ui/hooks/useGameTheme';

interface MockTheme {
    readonly accentColor: string;
}

const initialTheme: MockTheme = { accentColor: '#223344' };
const themeListeners: ((theme: MockTheme, name: string) => void)[] = [];

vi.mock('render/theme', () => ({
    getActiveTheme: () => initialTheme,
    getActiveThemeName: () => 'baseline',
    onThemeChange: (listener: (theme: MockTheme, name: string) => void) => {
        themeListeners.push(listener);
        return () => {
            const index = themeListeners.indexOf(listener);
            if (index >= 0) {
                themeListeners.splice(index, 1);
            }
        };
    },
}));

const emitThemeChange = (theme: MockTheme, name: string) => {
    [...themeListeners].forEach((listener) => listener(theme, name));
};

const ThemeViewer = () => {
    const snapshot = useGameTheme();
    return createElement('div', {
        'data-testid': 'theme-viewer',
        'data-theme-name': snapshot.name,
        'data-accent': snapshot.theme.accentColor,
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
        expect(viewer?.dataset.themeName).toBe('baseline');
        expect(viewer?.dataset.accent).toBe('#223344');
    });

    it('updates when the theme change event fires', async () => {
        await renderViewer();
        const viewer = container.querySelector<HTMLElement>('[data-testid="theme-viewer"]');
        expect(viewer).not.toBeNull();

        await act(async () => {
            emitThemeChange({ accentColor: '#ff00aa' }, 'aurora');
        });

        const updatedViewer = container.querySelector<HTMLElement>('[data-testid="theme-viewer"]');
        expect(updatedViewer?.dataset.themeName).toBe('aurora');
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
