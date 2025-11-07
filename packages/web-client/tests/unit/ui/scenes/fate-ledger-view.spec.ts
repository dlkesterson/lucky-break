import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import type { GameThemeDefinition } from 'render/theme';
import {
    FateLedgerView,
    type FateLedgerViewProps,
    type FateLedgerSummaryLine,
    type FateLedgerEntryLine,
} from '../../../../src/ui/scenes/FateLedgerView';
import { wrapWithI18n } from '../../../utils/test-wrapper';

describe('FateLedgerView', () => {
    let container: HTMLDivElement;
    let root: Root | null;

    const mockTheme = {
        background: { from: '#000000', to: '#111111' },
        hud: {
            panelFill: '#222222',
            panelLine: '#333333',
            textPrimary: '#f5f0ff',
            textSecondary: '#d0c0ff',
        },
        accents: { combo: '#ffd45c' },
    } as GameThemeDefinition;

    const defaultProps: FateLedgerViewProps = {
        visible: true,
        summaryLines: [
            { key: 'line-1', text: 'Summary line 1' },
            { key: 'line-2', text: 'Summary line 2' },
        ],
        entryLines: [
            { key: 'entry-1', text: 'Entry 1' },
            { key: 'entry-2', text: 'Entry 2' },
        ],
        theme: mockTheme,
        onClose: vi.fn(),
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

    const renderComponent = (props: FateLedgerViewProps) => {
        root = createRoot(container);
        act(() => {
            root?.render(wrapWithI18n(createElement(FateLedgerView, props)));
        });
    };

    it('returns null when not visible', () => {
        renderComponent({ ...defaultProps, visible: false });
        expect(container.innerHTML).toBe('');
    });

    it('renders the title and description', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        expect(ctx.getByText(/fate ledger/i)).toBeDefined();
        expect(ctx.getByText(/chronicle of idle rolls/i)).toBeDefined();
    });

    it('renders summary lines with correct structure', () => {
        const summaryLines: FateLedgerSummaryLine[] = [
            { key: 'summary-1', text: 'First summary item' },
            { key: 'summary-2', text: 'Second summary item' },
        ];
        renderComponent({ ...defaultProps, summaryLines });
        const ctx = within(container);
        expect(ctx.getByText('First summary item')).toBeDefined();
        expect(ctx.getByText('Second summary item')).toBeDefined();
    });

    it('renders entry lines when present', () => {
        const entryLines: FateLedgerEntryLine[] = [
            { key: 'entry-1', text: 'Entry one' },
            { key: 'entry-2', text: 'Entry two' },
        ];
        renderComponent({ ...defaultProps, entryLines });
        const ctx = within(container);
        expect(ctx.getByText('Entry one')).toBeDefined();
        expect(ctx.getByText('Entry two')).toBeDefined();
    });

    it('displays empty state when no entry lines', () => {
        renderComponent({ ...defaultProps, entryLines: [] });
        const ctx = within(container);
        expect(ctx.getByText(/no idle rolls recorded yet/i)).toBeDefined();
    });

    it('calls onClose when overlay backdrop is clicked', () => {
        const onClose = vi.fn();
        renderComponent({ ...defaultProps, onClose });
        const ctx = within(container);
        const overlay = ctx.getByRole('presentation');
        act(() => {
            overlay.click();
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is clicked', () => {
        const onClose = vi.fn();
        renderComponent({ ...defaultProps, onClose });
        const ctx = within(container);
        const closeButton = ctx.getByRole('button', { name: /close/i });
        act(() => {
            closeButton.click();
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside dialog surface', () => {
        const onClose = vi.fn();
        renderComponent({ ...defaultProps, onClose });
        const ctx = within(container);
        const dialog = ctx.getByRole('dialog');
        act(() => {
            dialog.click();
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('applies theme CSS custom properties', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        const overlay = ctx.getByRole('presentation');
        const style = overlay.style;
        expect(style.getPropertyValue('--ledger-bg-from')).toBe('#000000');
        expect(style.getPropertyValue('--ledger-bg-to')).toBe('#111111');
        expect(style.getPropertyValue('--ledger-panel-fill')).toBe('#222222');
        expect(style.getPropertyValue('--ledger-panel-line')).toBe('#333333');
        expect(style.getPropertyValue('--ledger-text-primary')).toBe('#f5f0ff');
        expect(style.getPropertyValue('--ledger-text-secondary')).toBe('#d0c0ff');
        expect(style.getPropertyValue('--ledger-highlight')).toBe('#ffd45c');
    });

    it('sets proper ARIA attributes', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        const overlay = ctx.getByRole('presentation');
        expect(overlay).toBeDefined();
        const dialog = ctx.getByRole('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('fate-ledger-title');
    });

    it('attaches overlay ref when provided', () => {
        const ref = { current: null as HTMLDivElement | null };
        renderComponent({ ...defaultProps, overlayRef: ref });
        expect(ref.current).toBeDefined();
        expect(ref.current?.tagName).toBe('DIV');
        expect(ref.current?.getAttribute('role')).toBe('presentation');
    });

    it('renders all summary lines with unique keys', () => {
        const summaryLines: FateLedgerSummaryLine[] = [
            { key: 'unique-1', text: 'Line 1' },
            { key: 'unique-2', text: 'Line 2' },
            { key: 'unique-3', text: 'Line 3' },
        ];
        renderComponent({ ...defaultProps, summaryLines });
        const ctx = within(container);
        const panel = ctx.getByLabelText(/idle roll summary/i);
        const items = within(panel).getAllByRole('listitem');
        expect(items.length).toBe(3);
    });

    it('renders all entry lines with unique keys', () => {
        const entryLines: FateLedgerEntryLine[] = [
            { key: 'entry-1', text: 'Entry 1' },
            { key: 'entry-2', text: 'Entry 2' },
            { key: 'entry-3', text: 'Entry 3' },
            { key: 'entry-4', text: 'Entry 4' },
        ];
        renderComponent({ ...defaultProps, entryLines });
        const ctx = within(container);
        const panel = ctx.getByLabelText(/recent entries/i);
        const items = within(panel).getAllByRole('listitem');
        expect(items.length).toBe(4);
    });

    it('renders close hint text', () => {
        renderComponent(defaultProps);
        const ctx = within(container);
        expect(ctx.getByText(/tap anywhere outside/i)).toBeDefined();
    });
});
