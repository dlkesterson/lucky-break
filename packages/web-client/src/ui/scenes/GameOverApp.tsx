import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useGameOverUi } from '../state/game-over-bridge';

const formatDust = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value.toLocaleString();
};

const formatScore = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return value.toLocaleString();
};

export const GameOverApp = (): JSX.Element | null => {
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

  const overlayStyle = useMemo(
    () =>
      ({
        '--game-over-bg-from': theme.background.from,
        '--game-over-bg-to': theme.background.to,
        '--game-over-panel-fill': theme.hud.panelFill,
        '--game-over-panel-line': theme.hud.panelLine,
        '--game-over-text-primary': theme.hud.textPrimary,
        '--game-over-text-secondary': theme.hud.textSecondary,
        '--game-over-accent': theme.hud.danger,
        '--game-over-highlight': theme.accents.combo,
      }) as CSSProperties,
    [theme],
  );

  if (!isActive || !snapshot) {
    return null;
  }

  const dustLabel = formatDust(snapshot.dustAwarded ?? null);

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
    <div className="game-over-overlay" style={overlayStyle} ref={overlayRef}>
      <div className="game-over-backdrop" />
      <div
        className="game-over-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <header className="game-over-header">
          <h1 id="game-over-title">{snapshot.title}</h1>
          <p>{snapshot.scoreLabel}</p>
        </header>

        <section className="game-over-summary" aria-label="Run summary">
          <div className="game-over-score">
            <span className="game-over-score-label">Final Score</span>
            <span className="game-over-score-value">{formatScore(snapshot.score)}</span>
          </div>
          {dustLabel && (
            <div className="game-over-dust">
              <span className="game-over-dust-label">Certainty Dust</span>
              <span className="game-over-dust-value">{dustLabel}</span>
            </div>
          )}
        </section>

        <section className="game-over-achievements" aria-label="Achievements unlocked">
          {snapshot.achievements.length > 0 ? (
            <>
              <h2>Achievements Unlocked</h2>
              <ul>
                {snapshot.achievements.map((achievement) => (
                  <li key={achievement.id}>
                    <span className="game-over-achievement-title">{achievement.title}</span>
                    <span className="game-over-achievement-description">
                      {achievement.description}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="game-over-achievements-empty">
              No new achievements this run — fortune favours persistence.
            </p>
          )}
        </section>

        <button
          type="button"
          className="game-over-restart"
          onClick={handleRestart}
          disabled={pending}
        >
          {pending ? 'Returning…' : snapshot.prompt}
        </button>
      </div>
    </div>
  );
};
