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

    it('returns null when HUD is hidden or scoreboard missing', async () => {
        hudState = createHudState({ visible: false, scoreboard: null });

        await renderHud();

        expect(container.innerHTML).toBe('');

        hudState = createHudState({ visible: true, scoreboard: null });
        await renderHud();
        expect(container.innerHTML).toBe('');
    });

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
            },
            flavor: { id: 'flavor-1', text: 'Streak rising', tone: 'hype' },
        });

        await renderHud();

        const screen = within(container);
        screen.getByText('In progress');
        screen.getByText('Take aim');
        screen.getByText('Score 123,456');
        screen.getByText('Combo ×4');
        screen.getByText('3.2s window');
        screen.getByText('Bricks 12 / 40');
        const progressBars = screen.getAllByRole('progressbar');
        // First progress bar should be the brick progress with 70% value
        expect(progressBars[0]?.getAttribute('aria-valuenow')).toBe('70');

        const momentumSection = screen.getByRole('heading', { name: 'Momentum' }).closest('section');
        expect(momentumSection).not.toBeNull();
        const momentumItems = momentumSection ? within(momentumSection).getAllByRole('listitem') : [];
        expect(momentumItems).toHaveLength(3);

        const powerUpsHeading = screen.getByRole('heading', { name: 'Power-Ups' });
        const powerUpsSection = powerUpsHeading.closest('section');
        expect(powerUpsSection).not.toBeNull();
        if (powerUpsSection instanceof HTMLElement) {
            within(powerUpsSection).getByText('Magnet');
        }

        const secondaryEntry = container.querySelector('.hud-entry');
        expect(secondaryEntry).not.toBeNull();
        if (secondaryEntry instanceof HTMLElement) {
            expect(within(secondaryEntry).getByText('Entropy')).toBeDefined();
        }

        screen.getByText('Mystery Reward');
        screen.getByText('5s');
        const flavorElement = container.querySelector('.hud-flavor-hype');
        expect(flavorElement?.textContent).toBe('Streak rising');

        screen.getByText('Difficulty ×1.35');
        screen.getByText('60 fps');
        screen.getByLabelText('Lives');
        screen.getByLabelText('Coins');
    });
});
