import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GameOverView, type GameOverViewProps, type GameOverAchievement } from 'ui/scenes/GameOverView';
import type { GameThemeDefinition } from 'render/theme';
import { wrapWithI18n } from '../../../utils/test-wrapper';

const createTheme = (): GameThemeDefinition =>
    ({
        background: { from: '#111122', to: '#221111' },
        hud: {
            panelFill: '#222222',
            panelLine: '#333333',
            textPrimary: '#eeeeee',
            textSecondary: '#bbbbbb',
            danger: '#ff3366',
        },
        accents: { combo: '#55ffee' },
    }) as GameThemeDefinition;

describe('GameOverView', () => {
    let container: HTMLDivElement;
    let root: Root;

    const defaultProps: GameOverViewProps = {
        visible: true,
        title: 'Game Over',
        scoreLabel: 'Score 1,234',
        score: 1234,
        dustAwarded: null,
        achievements: [],
        prompt: 'Play Again',
        pending: false,
        theme: createTheme(),
        onRestart: vi.fn(),
    };

    const renderView = async (props: Partial<GameOverViewProps> = {}) => {
        await act(async () => {
            root.render(wrapWithI18n(createElement(GameOverView, { ...defaultProps, ...props })));
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
    });

    it('returns null when not visible', async () => {
        await renderView({ visible: false });
        expect(container.innerHTML).toBe('');
    });

    it('renders the title and score label', async () => {
        await renderView();
        const queries = within(container);

        queries.getByText('Game Over');
        queries.getByText('Score 1,234');
    });

    it('formats and displays the score', async () => {
        await renderView({ score: 987654 });
        const queries = within(container);

        queries.getByText('987,654');
    });

    it('displays certainty dust when awarded', async () => {
        await renderView({ dustAwarded: 4200 });
        const queries = within(container);

        queries.getByText('4,200');
        queries.getByText(/certainty dust/i);
    });

    it('does not display certainty dust section when null', async () => {
        await renderView({ dustAwarded: null });
        const queries = within(container);

        expect(queries.queryByText(/certainty dust/i)).toBeNull();
    });

    it('does not display certainty dust when zero or negative', async () => {
        await renderView({ dustAwarded: 0 });
        let queries = within(container);
        expect(queries.queryByText(/certainty dust/i)).toBeNull();

        await renderView({ dustAwarded: -10 });
        queries = within(container);
        expect(queries.queryByText(/certainty dust/i)).toBeNull();
    });

    it('displays achievements when present', async () => {
        const achievements: GameOverAchievement[] = [
            { id: 'combo-king', title: 'Combo King', description: 'Reach a combo of 8.' },
            { id: 'brick-marathon', title: 'Brick Marathon', description: 'Break 1,000 bricks.' },
        ];

        await renderView({ achievements });
        const queries = within(container);

        queries.getByText('Achievements Unlocked');
        queries.getByText('Combo King');
        queries.getByText('Reach a combo of 8.');
        queries.getByText('Brick Marathon');
        queries.getByText('Break 1,000 bricks.');
    });

    it('displays empty state when no achievements', async () => {
        await renderView({ achievements: [] });
        const queries = within(container);

        expect(queries.queryByText('Achievements Unlocked')).toBeNull();
        queries.getByText(/no new achievements/i);
    });

    it('renders restart button with correct prompt', async () => {
        await renderView({ prompt: 'Try Again' });
        const queries = within(container);

        queries.getByRole('button', { name: /try again/i });
    });

    it('calls onRestart when button is clicked', async () => {
        const onRestart = vi.fn();
        await renderView({ onRestart });
        const queries = within(container);

        const button = queries.getByRole('button', { name: /play again/i });
        fireEvent.click(button);

        expect(onRestart).toHaveBeenCalledTimes(1);
    });

    it('disables restart button when pending', async () => {
        await renderView({ pending: true });
        const queries = within(container);

        const button = queries.getByRole('button', { name: /play again/i });
        expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('does not disable button when not pending', async () => {
        await renderView({ pending: false });
        const queries = within(container);

        const button = queries.getByRole('button', { name: /play again/i });
        expect(button.hasAttribute('disabled')).toBe(false);
    });

    it('handles non-finite score values gracefully', async () => {
        await renderView({ score: NaN });
        let queries = within(container);
        queries.getByText('0');

        await renderView({ score: Infinity });
        queries = within(container);
        queries.getByText('0');
    });

    it('applies theme CSS custom properties', async () => {
        const customTheme = {
            background: { from: '#abc123', to: '#def456' },
            hud: {
                panelFill: '#111111',
                panelLine: '#222222',
                textPrimary: '#ffffff',
                textSecondary: '#cccccc',
                danger: '#ff0000',
            },
            accents: { combo: '#00ff00' },
        } as GameThemeDefinition;

        await renderView({ theme: customTheme });

        const overlay = container.querySelector('[style*="--game-over-bg-from"]') as HTMLElement;
        expect(overlay).toBeTruthy();
        expect(overlay?.style.getPropertyValue('--game-over-bg-from')).toBe('#abc123');
        expect(overlay?.style.getPropertyValue('--game-over-bg-to')).toBe('#def456');
    });

    it('sets proper ARIA attributes for accessibility', async () => {
        await renderView();
        const queries = within(container);

        const dialog = queries.getByRole('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('game-over-title');

        const runSummary = queries.getByLabelText('Run summary');
        expect(runSummary).toBeTruthy();

        const achievementsPanel = queries.getByLabelText('Achievements unlocked');
        expect(achievementsPanel).toBeTruthy();
    });

    it('attaches overlay ref when provided', async () => {
        const ref = { current: null as HTMLDivElement | null };
        await renderView({ overlayRef: ref });

        expect(ref.current).toBeTruthy();
        expect(ref.current instanceof HTMLDivElement).toBe(true);
    });
});
