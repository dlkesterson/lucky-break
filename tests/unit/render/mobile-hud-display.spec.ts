import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPoint = () => ({
    x: 0,
    y: 0,
    set(x: number, y?: number) {
        this.x = x;
        this.y = y ?? x;
    },
});

vi.mock('pixi.js', () => {
    class Container {
        public children: unknown[] = [];
        public eventMode: string | undefined;
        public visible = true;
        public alpha = 1;
        public parent: Container | null = null;
        public label = '';
        public name = '';
        public position = createPoint();
        public scale = createPoint();
        public cursor: string | undefined;
        public hitArea: unknown = null;
        private listeners = new Map<string, ((...args: unknown[]) => void)[]>();

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: Container | null }).parent = this;
                }
            });
            return items[0];
        }

        on(event: string, handler: (...args: unknown[]) => void): this {
            const existing = this.listeners.get(event) ?? [];
            existing.push(handler);
            this.listeners.set(event, existing);
            return this;
        }

        removeAllListeners(): this {
            this.listeners.clear();
            return this;
        }

        emit(event: string, ...args: unknown[]): void {
            const handlers = this.listeners.get(event);
            handlers?.forEach((handler) => handler(...args));
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

    class Rectangle {
        public constructor(
            public readonly x: number,
            public readonly y: number,
            public readonly width: number,
            public readonly height: number,
        ) { }
    }

    class Text extends Container {
        public text: string;
        public style: Record<string, unknown>;
        public alpha = 1;
        public visible = true;
        public scale = createPoint();
        public anchor = createPoint();
        public height: number;
        public width: number;

        public constructor(text: string, style: Record<string, unknown>) {
            super();
            this.text = text;
            this.style = { ...style };
            const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 16;
            this.height = fontSize;
            this.width = Math.max(1, text.length) * 10;
        }
    }

    return {
        Container,
        Graphics,
        Rectangle,
        Text,
    };
});

import { Container, Text, type FederatedPointerEvent } from 'pixi.js';
import { createMobileHudDisplay } from 'render/mobile-hud-display';
import type { GameThemeDefinition } from 'render/theme';
import type { HudDisplayUpdate } from 'render/hud-display';

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

const createTheme = (): GameThemeDefinition => ({
    background: { from: '#160B27', to: '#2B1140', starAlpha: 0.18 },
    brickColors: ['#F3443C', '#FF8A34', '#FFD04A', '#95D146'],
    paddle: { gradient: ['#4CB7FF', '#1E3F9A'], glow: 0.48 },
    ball: { core: '#F8F4DD', aura: '#FFF2D7', highlight: '#FFFFFF' },
    font: 'Luckiest Guy, sans-serif',
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

const createUpdatePayload = (): HudDisplayUpdate => ({
    view: {
        statusText: 'Round 5 — Active',
        summaryLine: '',
        entries: [
            { id: 'score', label: 'Score', value: '12,500' },
            { id: 'lives', label: 'Lives', value: '❤❤❤' },
            { id: 'coins', label: 'Coins', value: '24c' },
        ],
        prompts: [],
    },
    difficultyMultiplier: 1.5,
    comboCount: 0,
    comboTimer: 0,
    activePowerUps: [],
    reward: null,
    momentum: {
        comboHeat: 0,
        speedPressure: 0,
        brickDensity: 0,
        volleyLength: 0,
        comboTimer: 0,
    },
});

const isText = (value: unknown): value is Text => value instanceof Text;

describe('createMobileHudDisplay', () => {
    let theme: GameThemeDefinition;
    let payload: HudDisplayUpdate;

    beforeEach(() => {
        theme = createTheme();
        payload = createUpdatePayload();
    });

    it('renders the mobile HUD layout and toggles the combo label when active', () => {
        const display = createMobileHudDisplay(theme);

        display.update(payload);

        expect(display.width).toBe(360);
        expect(display.getHeight()).toBeGreaterThanOrEqual(96);

        const texts = display.container.children.filter(isText);
        expect(texts).toHaveLength(5);

        const statusText = texts[0];
        const summaryText = texts[1];
        const statLineText = texts[2];
        const difficultyText = texts[3];
        const comboText = texts[4];

        expect(statusText.text).toBe(payload.view.statusText);
        expect(summaryText.visible).toBe(false);
        expect(statLineText.text).toBe('Score 12,500 · Lives ❤❤❤ · Coins 24c');
        expect(difficultyText.text).toBe('Diff ×1.50');
        expect(comboText.visible).toBe(false);
        expect(comboText.scale.x).toBe(1);

        display.pulseCombo();
        const withCombo: HudDisplayUpdate = {
            ...payload,
            comboCount: 4,
            view: {
                ...payload.view,
                summaryLine: 'Momentum rising',
            },
        };
        display.update(withCombo);

        expect(comboText.visible).toBe(true);
        expect(comboText.text).toBe('Combo ×4');
        const firstScale = comboText.scale.x;
        expect(firstScale).toBeGreaterThan(1.07);
        expect(comboText.alpha).toBeGreaterThan(0.8);
        expect(summaryText.visible).toBe(true);
        expect(summaryText.text).toBe('Momentum rising');

        display.update(withCombo);
        expect(comboText.scale.x).toBeLessThan(firstScale);
        expect(comboText.alpha).toBeLessThanOrEqual(1);

        const resetPayload: HudDisplayUpdate = { ...payload, comboCount: 0 };
        display.update(resetPayload);
        expect(comboText.visible).toBe(false);
        expect(summaryText.visible).toBe(false);

        display.pulseCombo(0.9);
        display.update(withCombo);
        expect(comboText.scale.x).toBeGreaterThan(firstScale);
    });

    it('updates text styling when a new theme is applied', () => {
        const display = createMobileHudDisplay(theme);
        display.update(payload);

        const texts = display.container.children.filter(isText);
        const statusText = texts[0];
        const summaryText = texts[1];
        const statLineText = texts[2];
        const difficultyText = texts[3];
        const comboText = texts[4];

        const nextTheme: GameThemeDefinition = {
            ...theme,
            font: 'Avenir',
            monoFont: 'Source Code Pro',
            hud: {
                ...theme.hud,
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

        expect(statusText.style.fill).toBe(parseColor(nextTheme.hud.textPrimary));
        expect(summaryText.style.fill).toBe(parseColor(nextTheme.hud.textSecondary));
        expect(statLineText.style.fontFamily).toBe(nextTheme.monoFont);
        expect(difficultyText.style.fill).toBe(parseColor(nextTheme.hud.textSecondary));
        expect(comboText.style.fill).toBe(parseColor(nextTheme.accents.combo));

        const fallbackTheme = {
            ...nextTheme,
            font: 'Orbitron',
            monoFont: undefined,
        } as unknown as GameThemeDefinition;

        display.setTheme(fallbackTheme);

        expect(statLineText.style.fontFamily).toBe(fallbackTheme.font);
        expect(difficultyText.style.fontFamily).toBe(fallbackTheme.font);
    });

    it('falls back to default scoreboard values when entries are missing', () => {
        const display = createMobileHudDisplay(theme);
        const sparsePayload: HudDisplayUpdate = {
            ...payload,
            view: {
                statusText: '',
                summaryLine: '',
                prompts: [],
                entries: [
                    { id: 'coins', label: 'Coins', value: '5c' },
                ],
            },
            difficultyMultiplier: 0.75,
            comboCount: 0,
        };

        display.update(sparsePayload);

        const texts = display.container.children.filter(isText);
        const statusText = texts[0];
        const summaryText = texts[1];
        const statLineText = texts[2];
        const difficultyText = texts[3];
        const comboText = texts[4];

        expect(statusText.visible).toBe(false);
        expect(summaryText.visible).toBe(false);
        expect(statLineText.text).toBe('Score 0 · Lives — · Coins 5c');
        expect(difficultyText.text).toBe('Diff ×0.75');
        expect(comboText.visible).toBe(false);
        expect(display.getHeight()).toBeGreaterThanOrEqual(96);
    });

    it('renders entropy action buttons for touch controls and forwards taps', () => {
        const display = createMobileHudDisplay(theme);
        const handler = vi.fn();
        display.setEntropyActionHandler(handler);

        const entropyActions: NonNullable<HudDisplayUpdate['entropyActions']> = [
            { action: 'reroll', label: 'Reroll Reward', hotkey: 'R', cost: 30, charges: 1, affordable: true },
            { action: 'bailout', label: 'Bailout', hotkey: 'B', cost: 60, charges: 0, affordable: false },
        ];

        display.update({
            ...payload,
            entropyActions,
        });

        const entropyRoot = display.container.children.find(
            (child): child is Container => child instanceof Container && child.label === 'entropy-actions',
        );
        expect(entropyRoot).toBeDefined();
        expect(entropyRoot?.visible).toBe(true);

        const rerollButton = entropyRoot?.children.find(
            (child): child is Container => child instanceof Container && child.name === 'mobile-entropy-action-reroll',
        );
        expect(rerollButton).toBeDefined();

        handler.mockClear();
        rerollButton?.emit('pointertap', {} as unknown as FederatedPointerEvent);
        expect(handler).toHaveBeenCalledWith('reroll');

        const bailoutButton = entropyRoot?.children.find(
            (child): child is Container => child instanceof Container && child.name === 'mobile-entropy-action-bailout',
        );
        expect(bailoutButton).toBeDefined();

        handler.mockClear();
        bailoutButton?.emit('pointertap', {} as unknown as FederatedPointerEvent);
        expect(handler).not.toHaveBeenCalled();

        display.update({ ...payload, entropyActions: [] });
        expect(entropyRoot?.visible).toBe(false);
    });
});
