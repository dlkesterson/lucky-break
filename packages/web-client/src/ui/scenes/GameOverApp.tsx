import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useGameOverUi } from '../state/game-over-bridge';
import { GameOverView } from './GameOverView';

/**
 * GameOverApp - Container Component
 *
 * Handles:
 * - Game state integration (Zustand store)
 * - Theme provider integration
 * - Stage pointer blocking
 * - Event handler orchestration
 * - Pending state management
 *
 * Delegates presentation to GameOverView.
 */
export const GameOverApp = (): JSX.Element | null => {
  const { t } = useTranslation();
  const { theme } = useGameTheme();
  const { visible, suspended, snapshot } = useGameOverUi();
  const [pending, setPending] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null;

  useStagePointerBlocker(isActive, resolveDocument);

  useEffect(() => {
    if (!visible || suspended) {
      setPending(false);
    }
  }, [visible, suspended, snapshot]);

  if (!isActive || !snapshot) {
    return null;
  }

  const promptLabel = pending ? t('gameOver.promptPending') : snapshot.prompt;

  const handleRestart = async () => {
    if (pending) {
      return;
    }
    try {
      setPending(true);
      await snapshot.onRestart();
    } catch (error) {
      console.error('Failed to restart from game over overlay', error);
      setPending(false);
    }
  };

  return (
    <GameOverView
      visible={visible}
      title={snapshot.title}
      scoreLabel={snapshot.scoreLabel}
      score={snapshot.score}
      dustAwarded={snapshot.dustAwarded ?? null}
      achievements={snapshot.achievements}
      prompt={promptLabel}
      pending={pending}
      theme={theme}
      onRestart={handleRestart}
      overlayRef={overlayRef}
    />
  );
};
