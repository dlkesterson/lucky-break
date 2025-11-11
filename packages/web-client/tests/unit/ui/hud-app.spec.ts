import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HudState } from 'ui/state/game-bridge';

type HudStateMutable = HudState & { readonly [K in keyof HudState]: HudState[K] };

let hudState: HudStateMutable;
let HudAppComponent: typeof import('ui/HudApp')['HudApp'];

vi.mock('ui/state/game-bridge', () => ({
    useHud: () => hudState,
}));

describe('HudApp', () => {
    let container: HTMLDivElement;
    let root: Root;

    const createHudState = (overrides: Partial<HudState> = {}): HudStateMutable => ({
        score: 0,
        lives: 3,
        coins: 0,
        combo: 0,
        comboPulse: 0,
        fps: undefined,
        difficultyMultiplier: 1,
        comboTimer: 0,
        brickRemaining: 0,
        brickTotal: 0,
        scoreboard: null,
        activePowerUps: [],
        reward: null,
        entropyActions: [],
        momentum: null,
        prompts: [],
        visible: false,
        attemptEntropyAction: undefined,
        settings: {
            muted: false,
            masterVolume: 1,
            reducedMotion: false,
        },
        updateSettings: undefined,
        flavor: null,
        physics: null,
        ...overrides,
    });

    const renderHud = async () => {
        await act(async () => {
            root.render(createElement(HudAppComponent));
        });
    };

    beforeAll(async () => {
        ({ HudApp: HudAppComponent } = await import('ui/HudApp'));
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        hudState = createHudState();
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    describe('Visibility and Rendering Conditions', () => {
        it('returns null when HUD is hidden', async () => {
            hudState = createHudState({ visible: false, scoreboard: null });

            await renderHud();

            expect(container.innerHTML).toBe('');
        });

        it('returns null when scoreboard is missing even if visible', async () => {
            hudState = createHudState({ visible: true, scoreboard: null });

            await renderHud();

            expect(container.innerHTML).toBe('');
        });

        it('renders when both visible and scoreboard are present', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Ready',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            expect(container.innerHTML).not.toBe('');
            const screen = within(container);
            screen.getByText('Ready');
        });
    });

    describe('Core HUD Layout and Data Display', () => {
        it('renders the HUD layout with active data', async () => {
            hudState = createHudState({
                visible: true,
                score: 123456,
                lives: 3,
                coins: 87,
                combo: 4,
                comboPulse: 1.2,
                fps: 59.7,
                difficultyMultiplier: 1.35,
                comboTimer: 3.2,
                brickRemaining: 12,
                brickTotal: 40,
                scoreboard: {
                    statusText: 'In progress',
                    summaryLine: 'Take aim',
                    entries: [
                        { id: 'score', label: 'Score', value: '123456' },
                        { id: 'coins', label: 'Coins', value: '87c' },
                        { id: 'lives', label: 'Lives', value: '❤❤❤' },
                        { id: 'bricks', label: 'Bricks', value: '12 / 40' },
                        { id: 'momentum', label: 'Momentum', value: 'High' },
                        { id: 'entropy', label: 'Entropy', value: 'Rising' },
                    ],
                    prompts: [],
                },
                activePowerUps: [{ label: 'Magnet', remaining: '12s' }],
                reward: { label: 'Mystery Reward', remaining: '5s' },
                momentum: {
                    comboHeat: 0.82,
                    speedPressure: 1.4,
                    brickDensity: -0.2,
                    comboTimer: 1.5,
                    volleyLength: 6.7,
                    mirageStacks: 0,
                },
                flavor: { id: 'flavor-1', text: 'Streak rising', tone: 'hype' },
                physics: {
                    currentSpeed: 312.5,
                    baseSpeed: 280,
                    maxSpeed: 400,
                    gravity: -0.15,
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('In progress');
            screen.getByText('Score 123,456');
            screen.getByText('Combo ×4');
            screen.getByText('3.2s window');
            screen.getByText('12 bricks left');

            const progressBars = screen.getAllByRole('progressbar');
            expect(progressBars[0]?.getAttribute('aria-valuenow')).toBe('70');

            screen.getByText('Speed');
            screen.getByText('Gravity');

            const livesSvg = container.querySelector('svg');
            expect(livesSvg).not.toBeNull();

            const flavorElement = container.querySelector('.hud-flavor-hype');
            expect(flavorElement?.textContent).toBe('Streak rising');

            screen.getByText('60 fps');
            screen.getByLabelText('Coins');
        });

        it('displays correct brick progress percentage', async () => {
            hudState = createHudState({
                visible: true,
                brickRemaining: 5,
                brickTotal: 20,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const progressBars = within(container).getAllByRole('progressbar');
            expect(progressBars[0]?.getAttribute('aria-valuenow')).toBe('75');
        });

        it('handles zero bricks remaining correctly', async () => {
            hudState = createHudState({
                visible: true,
                brickRemaining: 0,
                brickTotal: 10,
                scoreboard: {
                    statusText: 'Complete',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('0 bricks left');
            const progressBars = screen.getAllByRole('progressbar');
            expect(progressBars[0]?.getAttribute('aria-valuenow')).toBe('100');
        });
    });

    describe('Score and Coin Formatting', () => {
        it('formats large scores with commas', async () => {
            hudState = createHudState({
                visible: true,
                score: 1234567,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('Score 1,234,567');
        });

        it('handles zero score correctly', async () => {
            hudState = createHudState({
                visible: true,
                score: 0,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('Score 0');
        });

        it('formats coins with c suffix', async () => {
            hudState = createHudState({
                visible: true,
                coins: 250,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('250c');
        });

        it('handles zero coins correctly', async () => {
            hudState = createHudState({
                visible: true,
                coins: 0,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('0c');
        });

        it('handles negative or invalid score values gracefully', async () => {
            hudState = createHudState({
                visible: true,
                score: -100,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('Score 0');
        });
    });

    describe('Combo Display and Pulse Effects', () => {
        it('displays combo when greater than zero', async () => {
            hudState = createHudState({
                visible: true,
                combo: 5,
                comboTimer: 2.5,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('Combo ×5');
            screen.getByText('2.5s window');
        });

        it('hides combo when zero', async () => {
            hudState = createHudState({
                visible: true,
                combo: 0,
                comboTimer: 0,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const comboElement = container.querySelector('.hud-combo');
            expect(comboElement).toBeNull();
        });

        it('applies combo pulse style correctly', async () => {
            hudState = createHudState({
                visible: true,
                combo: 3,
                comboPulse: 1.2,
                comboTimer: 1.5,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const comboElement = container.querySelector('.hud-combo') as HTMLElement;
            expect(comboElement).not.toBeNull();
            expect(comboElement?.style.getPropertyValue('--combo-pulse')).toBe('1.2');
        });

        it('clamps combo pulse to maximum of 1.6', async () => {
            hudState = createHudState({
                visible: true,
                combo: 8,
                comboPulse: 2.5,
                comboTimer: 3.0,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const comboElement = container.querySelector('.hud-combo') as HTMLElement;
            const pulseValue = parseFloat(comboElement?.style.getPropertyValue('--combo-pulse') || '0');
            expect(pulseValue).toBeLessThanOrEqual(1.6);
        });

        it('shows closed combo timer message when timer is zero', async () => {
            hudState = createHudState({
                visible: true,
                combo: 2,
                comboTimer: 0,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('Window closed');
        });
    });

    describe('Physics State Display', () => {
        it('displays speed when physics state is provided', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: {
                    currentSpeed: 325.7,
                    baseSpeed: 250,
                    maxSpeed: 500,
                    gravity: 0,
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('Speed');
            screen.getByText('326');
        });

        it('formats speed with decimals for lower values', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: {
                    currentSpeed: 45.67,
                    baseSpeed: 40,
                    maxSpeed: 100,
                    gravity: 0,
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('45.7');
        });

        it('displays upward gravity with up arrow', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: {
                    currentSpeed: 300,
                    baseSpeed: 250,
                    maxSpeed: 500,
                    gravity: -0.25,
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getByText('Gravity');
            const gravityElement = container.querySelector('.hud-gravity-up');
            expect(gravityElement).not.toBeNull();
            expect(gravityElement?.textContent).toContain('↑');
            expect(gravityElement?.textContent).toContain('0.25');
        });

        it('displays downward gravity with down arrow', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: {
                    currentSpeed: 300,
                    baseSpeed: 250,
                    maxSpeed: 500,
                    gravity: 0.15,
                },
            });

            await renderHud();

            const gravityElement = container.querySelector('.hud-gravity-down');
            expect(gravityElement).not.toBeNull();
            expect(gravityElement?.textContent).toContain('↓');
            expect(gravityElement?.textContent).toContain('0.15');
        });

        it('hides gravity when magnitude is near zero', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: {
                    currentSpeed: 300,
                    baseSpeed: 250,
                    maxSpeed: 500,
                    gravity: 0.005,
                },
            });

            await renderHud();

            const gravityLabel = container.querySelector('.hud-stat-label');
            const gravityElements = Array.from(container.querySelectorAll('.hud-stat-label'))
                .filter((el) => el.textContent?.includes('Gravity'));
            expect(gravityElements.length).toBe(0);
        });

        it('hides physics stats when physics state is null', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                physics: null,
            });

            await renderHud();

            const speedLabels = Array.from(container.querySelectorAll('.hud-stat-label'))
                .filter((el) => el.textContent?.includes('Speed'));
            expect(speedLabels.length).toBe(0);
        });
    });

    describe('FPS Display', () => {
        it('displays FPS when provided', async () => {
            hudState = createHudState({
                visible: true,
                fps: 60,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('60 fps');
        });

        it('rounds FPS to nearest integer', async () => {
            hudState = createHudState({
                visible: true,
                fps: 59.7,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByText('60 fps');
        });

        it('hides FPS when undefined', async () => {
            hudState = createHudState({
                visible: true,
                fps: undefined,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const fpsElement = container.querySelector('.hud-fps');
            expect(fpsElement).toBeNull();
        });

        it('handles invalid FPS values gracefully', async () => {
            hudState = createHudState({
                visible: true,
                fps: NaN,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const fpsElement = container.querySelector('.hud-fps');
            expect(fpsElement).toBeNull();
        });
    });

    describe('Flavor Messages', () => {
        it('displays flavor message with correct tone class', async () => {
            hudState = createHudState({
                visible: true,
                flavor: {
                    id: 'flavor-hype-1',
                    text: 'Incredible streak!',
                    tone: 'hype',
                },
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const flavorElement = container.querySelector('.hud-flavor-hype');
            expect(flavorElement).not.toBeNull();
            expect(flavorElement?.textContent).toBe('Incredible streak!');
        });

        it('applies info tone class correctly', async () => {
            hudState = createHudState({
                visible: true,
                flavor: {
                    id: 'flavor-info-1',
                    text: 'Combo building',
                    tone: 'info',
                },
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const flavorElement = container.querySelector('.hud-flavor-info');
            expect(flavorElement).not.toBeNull();
            expect(flavorElement?.textContent).toBe('Combo building');
        });

        it('applies warning tone class correctly', async () => {
            hudState = createHudState({
                visible: true,
                flavor: {
                    id: 'flavor-warning-1',
                    text: 'Danger ahead',
                    tone: 'warning',
                },
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const flavorElement = container.querySelector('.hud-flavor-warning');
            expect(flavorElement).not.toBeNull();
            expect(flavorElement?.textContent).toBe('Danger ahead');
        });

        it('hides flavor when null', async () => {
            hudState = createHudState({
                visible: true,
                flavor: null,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const flavorElement = container.querySelector('.hud-flavor');
            expect(flavorElement).toBeNull();
        });
    });

    describe('Lives Display', () => {
        it('renders lives dial SVG', async () => {
            hudState = createHudState({
                visible: true,
                lives: 3,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const livesSvg = container.querySelector('svg');
            expect(livesSvg).not.toBeNull();
        });

        it('updates when lives change', async () => {
            hudState = createHudState({
                visible: true,
                lives: 2,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            let livesSvg = container.querySelector('svg');
            expect(livesSvg).not.toBeNull();

            hudState = createHudState({
                visible: true,
                lives: 1,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            livesSvg = container.querySelector('svg');
            expect(livesSvg).not.toBeNull();
        });
    });

    describe('Accessibility Features', () => {
        it('has proper ARIA labels for sections', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const screen = within(container);
            screen.getAllByLabelText('Brick progress');
            screen.getByLabelText('Brick count');
            screen.getByLabelText('Coins');
        });

        it('marks dynamic sections with aria-live', async () => {
            hudState = createHudState({
                visible: true,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            const liveRegions = container.querySelectorAll('[aria-live="polite"]');
            expect(liveRegions.length).toBeGreaterThan(0);
        });

        it('includes frame rate label for accessibility', async () => {
            hudState = createHudState({
                visible: true,
                fps: 60,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
            });

            await renderHud();

            within(container).getByLabelText('Frame rate');
        });
    });
});
