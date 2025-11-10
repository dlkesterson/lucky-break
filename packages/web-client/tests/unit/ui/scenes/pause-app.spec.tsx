import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18n';
import { PauseApp } from 'ui/scenes/PauseApp';
import * as pauseBridge from 'ui/state/pause-bridge';
import * as gameBridge from 'ui/state/game-bridge';
import * as themeModule from 'render/theme';

vi.mock('ui/hooks/useGameTheme', () => ({
    useGameTheme: vi.fn(() => ({
        theme: {
            background: { from: '#000', to: '#111' },
            hud: {
                panelFill: '#222',
                panelLine: '#333',
                textPrimary: '#fff',
                textSecondary: '#ccc',
            },
            accents: { combo: '#f0f' },
        },
        name: 'cosmic',
    })),
}));

vi.mock('ui/hooks/useStagePointerBlocker', () => ({
    useStagePointerBlocker: vi.fn(),
}));

describe('PauseApp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when not visible', () => {
        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: false,
            suspended: false,
            snapshot: null,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        const { container } = render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        expect(container.firstChild).toBeNull();
    });

    it('returns null when suspended', () => {
        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: true,
            snapshot: {
                title: 'Paused',
                score: 1000,
                resumeLabel: 'Resume',
                quitLabel: 'Quit',
                onResume: vi.fn(),
                onQuit: vi.fn(),
            },
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        const { container } = render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders pause view when active', () => {
        const mockSnapshot = {
            title: 'Game Paused',
            score: 5000,
            resumeLabel: 'Resume Game',
            quitLabel: 'Quit to Menu',
            legendTitle: 'Legend',
            legendItems: [{ label: 'Brick', color: '#f00' }],
            onResume: vi.fn(),
            onQuit: vi.fn(),
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 100,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.75, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        expect(screen.getByText(/game paused/i)).toBeInTheDocument();
    });

    it('calls onResume when resume button is clicked', async () => {
        const user = userEvent.setup();
        const mockOnResume = vi.fn().mockResolvedValue(undefined);
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: mockOnResume,
            onQuit: vi.fn(),
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const resumeButton = screen.getByRole('button', { name: /resume/i });
        await user.click(resumeButton);

        expect(mockOnResume).toHaveBeenCalledOnce();
    });

    it('calls onQuit when quit button is clicked', async () => {
        const user = userEvent.setup();
        const mockOnQuit = vi.fn().mockResolvedValue(undefined);
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: vi.fn(),
            onQuit: mockOnQuit,
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const quitButton = screen.getByRole('button', { name: /quit/i });
        await user.click(quitButton);

        expect(mockOnQuit).toHaveBeenCalledOnce();
    });

    it('updates volume when slider changes', async () => {
        const user = userEvent.setup();
        const mockUpdateSettings = vi.fn();
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: vi.fn(),
            onQuit: vi.fn(),
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: mockUpdateSettings,
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const volumeSlider = screen.getByRole('slider');
        await user.clear(volumeSlider);
        await user.type(volumeSlider, '75');

        expect(mockUpdateSettings).toHaveBeenCalled();
    });

    it('toggles theme when theme button is clicked', async () => {
        const user = userEvent.setup();
        const mockToggleTheme = vi.spyOn(themeModule, 'toggleTheme').mockImplementation(() => {});
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: vi.fn(),
            onQuit: vi.fn(),
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const themeButton = screen.getByRole('button', { name: /theme/i });
        await user.click(themeButton);

        expect(mockToggleTheme).toHaveBeenCalledOnce();
    });

    it('handles errors during resume', async () => {
        const user = userEvent.setup();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const mockOnResume = vi.fn().mockRejectedValue(new Error('Resume failed'));
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: mockOnResume,
            onQuit: vi.fn(),
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const resumeButton = screen.getByRole('button', { name: /resume/i });
        await user.click(resumeButton);

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('handles errors during quit', async () => {
        const user = userEvent.setup();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const mockOnQuit = vi.fn().mockRejectedValue(new Error('Quit failed'));
        const mockSnapshot = {
            title: 'Paused',
            score: 1000,
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume: vi.fn(),
            onQuit: mockOnQuit,
        };

        vi.spyOn(pauseBridge, 'usePauseUi').mockReturnValue({
            visible: true,
            suspended: false,
            snapshot: mockSnapshot,
            resume: vi.fn(),
            quit: vi.fn(),
        });
        vi.spyOn(gameBridge, 'useHud').mockReturnValue({
            coins: 0,
            entropyActions: [],
            attemptEntropyAction: vi.fn(),
            settings: { masterVolume: 0.5, muted: false },
            updateSettings: vi.fn(),
        });

        render(
            <I18nextProvider i18n={i18n}>
                <PauseApp />
            </I18nextProvider>,
        );

        const quitButton = screen.getByRole('button', { name: /quit/i });
        await user.click(quitButton);

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});
