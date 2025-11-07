import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import type { GameThemeDefinition } from 'render/theme';
import {
    LoadoutSelectionView,
    type LoadoutSelectionViewProps,
    type LoadoutFormPreset,
} from '../../../../src/ui/scenes/LoadoutSelectionView';
import { wrapWithI18n } from '../../../utils/test-wrapper';

describe('LoadoutSelectionView', () => {
    let container: HTMLDivElement;
    let root: Root | null;

    const mockTheme = {
        hud: {
            panelFill: '#222222',
            panelLine: '#333333',
            textPrimary: '#f5f0ff',
            textSecondary: '#d0c0ff',
            danger: '#ff0000',
        },
        accents: { combo: '#ffd45c', powerUp: '#00ff00' },
    } as GameThemeDefinition;

    const mockPreset1: LoadoutFormPreset = {
        id: 'preset-1',
        name: 'Preset One',
        description: 'First preset description',
        preview: { shape: 'sphere' },
        trait: { name: 'Trait 1' },
        sigil: { name: 'Sigil 1' },
        voice: { name: 'Voice 1' },
        combinedSummary: ['Summary line 1', 'Summary line 2'],
        cardSummary: ['Card summary 1', 'Card summary 2'],
    } as unknown as LoadoutFormPreset;

    const mockPreset2: LoadoutFormPreset = {
        id: 'preset-2',
        name: 'Preset Two',
        description: 'Second preset description',
        preview: { shape: 'd20' },
        trait: { name: 'Trait 2' },
        sigil: { name: 'Sigil 2' },
        voice: { name: 'Voice 2' },
        combinedSummary: ['Summary A', 'Summary B'],
        cardSummary: ['Card A', 'Card B'],
    } as unknown as LoadoutFormPreset;

    const defaultProps: LoadoutSelectionViewProps = {
        visible: true,
        presets: [mockPreset1, mockPreset2],
        selectedFormId: 'preset-1',
        lockedForms: new Set<string>(),
        pending: false,
        pulseActive: false,
        showScrollHint: false,
        theme: mockTheme,
        ballStyle: {},
        d20Faces: [],
        d20PolygonPoints: '',
        d20FacetLineSegments: [],
        onSelectForm: vi.fn(),
        onStart: vi.fn(),
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = null;
    });

    afterEach(() => {
        if (root) {
            act(() => {
                root?.unmount();
            });
        }
        document.body.removeChild(container);
    });

    const renderComponent = (props: LoadoutSelectionViewProps) => {
        root = createRoot(container);
        act(() => {
            root?.render(wrapWithI18n(createElement(LoadoutSelectionView, props)));
        });
    };

    it('returns null when not visible', () => {
        renderComponent({ ...defaultProps, visible: false });
        expect(container.innerHTML).toBe('');
    });

    it('returns null when presets array is empty', () => {
        renderComponent({ ...defaultProps, presets: [] });
        expect(container.innerHTML).toBe('');
    });

    it('renders the title and description', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        expect(ctx.getByText(/choose your ball/i)).toBeDefined();
        expect(ctx.getByText(/shape mayhaps/i)).toBeDefined();
    });

    it('renders selected preset details', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        const preview = ctx.getByLabelText(/selected form/i);
        const previewCtx = within(preview);
        expect(previewCtx.getByText('Preset One')).toBeDefined();
        expect(previewCtx.getByText('First preset description')).toBeDefined();
        expect(previewCtx.getByText('Trait 1')).toBeDefined();
        expect(previewCtx.getByText('Sigil 1')).toBeDefined();
        expect(previewCtx.getByText('Voice 1')).toBeDefined();
    });

    it('renders combined summary lines', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        expect(ctx.getByText('Summary line 1')).toBeDefined();
        expect(ctx.getByText('Summary line 2')).toBeDefined();
    });

    it('displays empty state when no preset is selected', () => {
        renderComponent({ ...defaultProps, selectedFormId: null });
        const ctx = within(container);
        const preview = ctx.getByLabelText(/selected form/i);
        const previewCtx = within(preview);
        expect(previewCtx.getByText(/select a form to begin/i)).toBeDefined();
    });

    it('renders loadout cards for all presets', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        const grid = ctx.getByLabelText(/available forms/i);
        const buttons = within(grid).getAllByRole('button');
        expect(buttons.length).toBe(2);
    });

    it('marks selected card with is-selected class', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        const grid = ctx.getByLabelText(/available forms/i);
        const buttons = within(grid).getAllByRole('button');
        expect(buttons[0].className).toContain('is-selected');
        expect(buttons[1].className).not.toContain('is-selected');
    });

    it('calls onSelectForm when clicking a card', () => {
        const onSelectForm = vi.fn();
        renderComponent({ ...defaultProps, onSelectForm });
        const ctx = within(container);
        const grid = ctx.getByLabelText(/available forms/i);
        const cards = within(grid).getAllByRole('button');
        act(() => {
            cards[1].click();
        });
        expect(onSelectForm).toHaveBeenCalledWith('preset-2');
    });

    it('does not call onSelectForm when card is locked', () => {
        const onSelectForm = vi.fn();
        const lockedForms = new Set(['preset-2']);
        renderComponent({ ...defaultProps, onSelectForm, lockedForms });
        const ctx = within(container);
        const grid = ctx.getByLabelText(/available forms/i);
        const cards = within(grid).getAllByRole('button');
        act(() => {
            cards[1].click();
        });
        expect(onSelectForm).not.toHaveBeenCalled();
    });

    it('displays locked indicator on locked cards', () => {
        const lockedForms = new Set(['preset-2']);
        renderComponent({ ...defaultProps, lockedForms });
        const ctx = within(container);
        expect(ctx.getByText(/locked/i)).toBeDefined();
    });

    it('calls onStart when start button is clicked', () => {
        const onStart = vi.fn();
        renderComponent({ ...defaultProps, onStart });
        const ctx = within(container);
        const preview = ctx.getByLabelText(/selected form/i);
        const startButton = within(preview).getByRole('button');
        act(() => {
            startButton.click();
        });
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('disables start button when pending', () => {
        renderComponent({ ...defaultProps, pending: true });
        const ctx = within(container);
        const preview = ctx.getByLabelText(/selected form/i);
        const startButton = within(preview).getByRole('button');
        expect(startButton.hasAttribute('disabled')).toBe(true);
    });

    it('disables start button when selected form is locked', () => {
        const lockedForms = new Set(['preset-1']);
        renderComponent({ ...defaultProps, lockedForms });
        const ctx = within(container);
        const preview = ctx.getByLabelText(/selected form/i);
        const startButton = within(preview).getByRole('button');
        expect(startButton.hasAttribute('disabled')).toBe(true);
    });

    it('shows scroll hint when showScrollHint is true', () => {
        renderComponent({ ...defaultProps, showScrollHint: true });
        const ctx = within(container);
        expect(ctx.getByText(/scroll to browse/i)).toBeDefined();
    });

    it('does not show scroll hint when showScrollHint is false', () => {
        renderComponent({ ...defaultProps, showScrollHint: false });
        const ctx = within(container);
        expect(() => ctx.getByText(/scroll to browse/i)).toThrow();
    });

    it('applies theme CSS custom properties', () => {
        renderComponent(defaultProps);
        const overlay = container.querySelector('.loadout-overlay') as HTMLElement;
        expect(overlay).toBeDefined();
        const style = overlay.style;
        expect(style.getPropertyValue('--loadout-panel-fill')).toBe('#222222');
        expect(style.getPropertyValue('--loadout-panel-line')).toBe('#333333');
        expect(style.getPropertyValue('--loadout-text-primary')).toBe('#f5f0ff');
        expect(style.getPropertyValue('--loadout-text-secondary')).toBe('#d0c0ff');
        expect(style.getPropertyValue('--loadout-accent')).toBe('#ffd45c');
        expect(style.getPropertyValue('--loadout-power')).toBe('#00ff00');
        expect(style.getPropertyValue('--loadout-danger')).toBe('#ff0000');
    });

    it('renders d20 facets when shape is d20', () => {
        const d20Faces = [
            { id: 1, points: '10,10 20,20 30,30', fill: '#ff0000', opacity: 0.8 },
            { id: 2, points: '40,40 50,50 60,60', fill: '#00ff00', opacity: 0.6 },
        ];
        const d20FacetLineSegments = [
            { id: 'line-1', x1: '0', y1: '0', x2: '100', y2: '100' },
        ];
        renderComponent({
            ...defaultProps,
            selectedFormId: 'preset-2',
            d20Faces,
            d20PolygonPoints: '10,10 20,20 30,30',
            d20FacetLineSegments,
        });
        const svg = container.querySelector('.loadout-ball-facet-svg');
        expect(svg).toBeDefined();
        const faces = container.querySelectorAll('.loadout-ball-facet-face');
        expect(faces.length).toBe(2);
        const lines = container.querySelectorAll('.loadout-ball-facet-line');
        expect(lines.length).toBe(1);
    });

    it('attaches surface ref when provided', () => {
        const ref = { current: null as HTMLDivElement | null };
        renderComponent({ ...defaultProps, surfaceRef: ref });
        expect(ref.current).toBeDefined();
        expect(ref.current?.className).toContain('loadout-surface');
    });
});
