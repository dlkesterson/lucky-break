import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPoint = () => {
    return {
        x: 0,
        y: 0,
        set(x: number, y?: number) {
            this.x = x;
            this.y = y ?? x;
        },
    };
};

vi.mock('pixi.js', () => {
    class Container {
        public children: unknown[] = [];
        public eventMode: string | undefined;
        public visible = true;
        public alpha = 1;
        public parent: Container | null = null;
        public sortableChildren = false;
        public label = '';
        public position = createPoint();
        public scale = createPoint();
        private _x = 0;
        private _y = 0;

        get x(): number {
            return this._x;
        }

        set x(value: number) {
            this._x = value;
            this.position.x = value;
        }

        get y(): number {
            return this._y;
        }

        set y(value: number) {
            this._y = value;
            this.position.y = value;
        }

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: Container | null }).parent = this;
                }
            });
            return items[0];
        }
    }

    class Graphics extends Container {
        public drawCommands: { type: string; payload?: unknown }[] = [];

        clear(): void {
            this.drawCommands.push({ type: 'clear' });
        }

        roundRect(x: number, y: number, width: number, height: number, radius: number): this {
            this.drawCommands.push({ type: 'roundRect', payload: { x, y, width, height, radius } });
            return this;
        }

        fill(style: unknown): this {
            this.drawCommands.push({ type: 'fill', payload: style });
            return this;
        }

        stroke(style: unknown): this {
            this.drawCommands.push({ type: 'stroke', payload: style });
            return this;
        }
    }

    class FillGradient {
        public readonly stops: { offset: number; color: string }[] = [];

        public constructor(
            public readonly x0: number,
            public readonly y0: number,
            public readonly x1: number,
            public readonly y1: number,
        ) { }

        addColorStop(offset: number, color: string): void {
            this.stops.push({ offset, color });
        }
    }

    class Text extends Container {
        public text: string;
        public style: Record<string, unknown>;
        public alpha = 1;
        public visible = true;
        public scale = createPoint();

        public constructor(text: string, style: Record<string, unknown>) {
            super();
            this.text = text;
            this.style = { ...style };
        }
    }

    return {
        Container,
        Graphics,
        FillGradient,
        Text,
    };
});

import { Text, Graphics } from 'pixi.js';
import { createHudDisplay, type HudDisplayUpdate } from 'render/hud-display';
import type { GameThemeDefinition } from 'render/theme';

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

const createTheme = (): GameThemeDefinition => ({
    background: { from: '#000010', to: '#001133', starAlpha: 0.2 },
    brickColors: ['#FFAA33', '#FF5533'],
    paddle: { gradient: ['#00FFAA', '#00AAFF'], glow: 0.4 },
    ball: { core: '#FFFFFF', aura: '#CCCCCC', highlight: '#EEEEEE' },
    font: 'Orbitron',
    monoFont: 'Roboto Mono',
    hud: {
        panelFill: '#111122',
        panelLine: '#223355',
        textPrimary: '#F0F4FF',
        textSecondary: '#88CCFF',
        accent: '#FFD166',
        danger: '#FF6B6B',
    },
    accents: {
        combo: '#FFB347',
        powerUp: '#3DFFB6',
    },
});

const createUpdatePayload = (): HudDisplayUpdate => ({
    view: {
        statusText: 'Round 5 — Active',
        summaryLine: 'Elapsed 88s',
        entries: [
            { id: 'score', label: 'Score', value: '12,500' },
            { id: 'lives', label: 'Lives', value: '❤❤❤' },
            { id: 'bricks', label: 'Bricks', value: '24 / 96 (75%)' },
            { id: 'momentum', label: 'Momentum', value: 'Heat 9 · Volley 14' },
            { id: 'audio', label: 'Audio', value: 'Master 80%' },
        ],
        prompts: [
            { id: 'momentum', severity: 'warning', message: 'Momentum dropping' },
            { id: 'reward', severity: 'info', message: 'Collect bonus' },
        ],
    },
    difficultyMultiplier: 1.75,
    comboCount: 3,
    comboTimer: 2.4,
    activePowerUps: [
        { label: 'Sticky Paddle', remaining: '12s' },
        { label: 'Wide Paddle', remaining: '5s' },
    ],
    reward: { label: 'Double Points', remaining: '8s' },
});

const isText = (value: unknown): value is Text => value instanceof Text;

describe('createHudDisplay', () => {
    let theme: GameThemeDefinition;
    let payload: HudDisplayUpdate;

    beforeEach(() => {
        theme = createTheme();
        payload = createUpdatePayload();
    });

    it('renders scoreboard elements, toggles combo display, and resizes the panel', () => {
        const display = createHudDisplay(theme);

        expect(display.width).toBe(300);
        expect(display.getHeight()).toBe(260);

        display.update(payload);

        const { container } = display;
        const texts = container.children.filter(isText);

        const statusText = texts.find((text) => text.text === payload.view.statusText);
        expect(statusText?.y).toBe(18);

        const comboLabel = texts.find((text) => text.text.startsWith('Combo ×'));
        expect(comboLabel?.visible).toBe(true);
        expect(comboLabel?.scale.x).toBeCloseTo(1, 2);

        const comboTimer = texts.find((text) => text.text.endsWith('s window'));
        expect(comboTimer?.visible).toBe(true);
        expect(comboTimer?.alpha).toBeGreaterThanOrEqual(0.7);

        const powerHeader = texts.find((text) => text.text === 'Power-Ups');
        expect(powerHeader?.visible).toBe(true);

        const rewardText = texts.find((text) => text.text?.startsWith('Double Points'));
        expect(rewardText?.visible).toBe(true);

        const prompts = texts.filter((text) => text.text?.includes('Momentum dropping'));
        expect(prompts).toHaveLength(1);

        expect(display.getHeight()).toBeGreaterThan(260);

        const panel = container.children[0] as Graphics & { drawCommands: { type: string; payload?: any }[] };
        const lastRoundRect = panel.drawCommands.filter((command) => command.type === 'roundRect').at(-1);
        expect(lastRoundRect?.payload?.height).toBe(display.getHeight());
    });

    it('applies combo pulse intensity and decays over subsequent updates', () => {
        const display = createHudDisplay(theme);

        display.pulseCombo(0.9);
        display.update(payload);

        const comboLabel = display.container.children
            .filter(isText)
            .find((text) => text.text.startsWith('Combo ×'));
        expect(comboLabel).toBeDefined();
        expect(comboLabel?.scale.x).toBeGreaterThan(1.08);

        const firstScale = comboLabel?.scale.x ?? 0;

        display.update(payload);

        expect(comboLabel?.scale.x ?? 0).toBeLessThan(firstScale);
    });

    it('updates text styles and panel colors when the theme changes', () => {
        const display = createHudDisplay(theme);
        display.update(payload);

        const nextTheme: GameThemeDefinition = {
            ...theme,
            font: 'Avenir',
            monoFont: 'Source Code Pro',
            hud: {
                ...theme.hud,
                panelLine: '#552244',
                textPrimary: '#AAFFEE',
                textSecondary: '#66AAFF',
                accent: '#FFAA00',
                danger: '#FF3377',
            },
            accents: {
                ...theme.accents,
                combo: '#FFCC00',
            },
        };

        display.setTheme(nextTheme);

        const texts = display.container.children.filter(isText);
        const statusText = texts.find((text) => text.text === payload.view.statusText);
        const rewardText = texts.find((text) => text.text.startsWith('Double Points'));
        const warningPrompt = texts.find((text) => text.text.startsWith('! '));

        expect(statusText?.style.fill).toBe(parseColor(nextTheme.hud.textPrimary));
        expect(rewardText?.style.fill).toBe(parseColor(nextTheme.hud.accent));
        expect(warningPrompt?.style.fill).toBe(parseColor(nextTheme.hud.danger));

        const panel = display.container.children[0] as Graphics & { drawCommands: { type: string; payload?: any }[] };
        const strokeCommand = panel.drawCommands.filter((command) => command.type === 'stroke').at(-1);
        expect(strokeCommand?.payload).toMatchObject({ color: parseColor(nextTheme.hud.panelLine) });
    });
});
