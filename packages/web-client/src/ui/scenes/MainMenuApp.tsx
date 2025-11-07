import { useCallback, useEffect, useRef, useState } from 'react';
import { getThemeLabel } from 'render/theme';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useMainMenuUi } from '../state/main-menu-bridge';
import { MainMenuView } from './MainMenuView';

/**
 * MainMenuApp - Container Component
 *
 * Handles:
 * - Game state integration (Zustand store)
 * - Theme provider integration
 * - Stage pointer blocking
 * - Event handler orchestration
 * - Pending state management
 *
 * Delegates presentation to MainMenuView.
 */
export const MainMenuApp = (): JSX.Element | null => {
  const { theme, name: themeName } = useGameTheme();
  const { visible, suspended, snapshot } = useMainMenuUi();
  const [pendingStart, setPendingStart] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null;

  useStagePointerBlocker(isActive, resolveDocument);

  useEffect(() => {
    if (!isActive) {
      setPendingStart(false);
    }
  }, [isActive]);

  if (!isActive || !snapshot) {
    return null;
  }

  const handleStart = async () => {
    if (pendingStart) {
      return;
    }

    setPendingStart(true);
    try {
      await snapshot.onStart();
    } catch (error) {
      console.error('Failed to begin session from main menu overlay', error);
    } finally {
      setPendingStart(false);
    }
  };

  const handleTogglePerformance = async () => {
    try {
      await snapshot.onTogglePerformance();
    } catch (error) {
      console.error('Failed to toggle performance mode from main menu overlay', error);
    }
  };

  const handleOpenLedger = async () => {
    try {
      await snapshot.onOpenLedger();
    } catch (error) {
      console.error('Failed to open fate ledger from main menu overlay', error);
    }
  };

  const handleToggleTheme = () => {
    try {
      snapshot.onToggleTheme();
    } catch (error) {
      console.error('Failed to toggle theme from main menu overlay', error);
    }
  };

  const handleShowStory = async () => {
    try {
      await snapshot.onShowStory();
    } catch (error) {
      console.error('Failed to open narrative intro from main menu overlay', error);
    }
  };

  return (
    <MainMenuView
      visible={visible}
      title={snapshot.title}
      prompt={snapshot.prompt}
      prologue={snapshot.prologue}
      helpLines={snapshot.helpLines}
      scores={snapshot.scores}
      performanceEnabled={snapshot.performanceEnabled}
      pendingStart={pendingStart}
      theme={theme}
      themeName={themeName}
      onStart={handleStart}
      onTogglePerformance={handleTogglePerformance}
      onToggleTheme={handleToggleTheme}
      onOpenLedger={handleOpenLedger}
      onShowStory={handleShowStory}
      overlayRef={overlayRef}
    />
  );
};
