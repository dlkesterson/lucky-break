import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { toggleTheme, getThemeLabel } from 'render/theme';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { usePauseUi } from '../state/pause-bridge';

const formatScore = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return value.toLocaleString();
};

export const PauseApp = (): JSX.Element | null => {
  const { theme, name: themeName } = useGameTheme();
  const { visible, suspended, snapshot } = usePauseUi();
  const [pendingAction, setPendingAction] = useState<'resume' | 'quit' | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null;
  const legendLines = snapshot?.legendLines ?? [];

  useStagePointerBlocker(isActive, resolveDocument);

  useEffect(() => {
    if (!visible || suspended) {
      setPendingAction(null);
    }
  }, [visible, suspended, snapshot]);

  const overlayStyle = useMemo(
    () =>
      ({
        '--pause-bg-from': theme.background.from,
        '--pause-bg-to': theme.background.to,
        '--pause-panel-fill': theme.hud.panelFill,
        '--pause-panel-line': theme.hud.panelLine,
        '--pause-text-primary': theme.hud.textPrimary,
        '--pause-text-secondary': theme.hud.textSecondary,
        '--pause-accent': theme.accents.combo,
      }) as CSSProperties,
    [theme],
  );

  const themeLabel = useMemo(() => `Color Mode: ${getThemeLabel(themeName)}`, [themeName]);

  const resetPendingIfVisible = () => {
    if (!visible) {
      setPendingAction(null);
    }
  };

  if (!isActive || !snapshot) {
    return null;
  }

  const handleResume = async (event?: MouseEvent) => {
    event?.stopPropagation();
    if (pendingAction) {
      return;
    }
    try {
      setPendingAction('resume');
      await snapshot.onResume();
    } catch (error) {
      console.error('Failed to resume from pause overlay', error);
      setPendingAction(null);
      resetPendingIfVisible();
    }
  };

  const handleQuit = async (event?: MouseEvent) => {
    event?.stopPropagation();
    if (!snapshot.onQuit || pendingAction) {
      return;
    }
    try {
      setPendingAction('quit');
      await snapshot.onQuit();
    } catch (error) {
      console.error('Failed to quit from pause overlay', error);
      setPendingAction(null);
      resetPendingIfVisible();
    }
  };

  return (
    <div className="pause-overlay" style={overlayStyle} ref={overlayRef}>
      <div className="pause-backdrop" />
      <div
        className="pause-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        onClick={(event) => {
          void handleResume(event);
        }}
      >
        <header className="pause-header">
          <h1 id="pause-title">{snapshot.title}</h1>
          <p>Run paused — the odds wait for no one.</p>
        </header>

        <section className="pause-score" aria-label="Current score">
          <span className="pause-score-label">Score</span>
          <span className="pause-score-value">{formatScore(snapshot.score)}</span>
        </section>

        <section className="pause-legend" aria-label="Power-up legend">
          {snapshot.legendTitle && <h2>{snapshot.legendTitle}</h2>}
          {legendLines.length > 0 ? (
            <ul>
              {legendLines.map((line, index) => (
                <li key={`legend-line-${index}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="pause-legend-empty">
              No legend entries yet — experiment to reveal mysteries.
            </p>
          )}
        </section>

        <footer className="pause-footer">
          <div className="pause-actions">
            <button
              type="button"
              className="pause-button pause-button--primary"
              onClick={handleResume}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'resume' ? 'Resuming…' : snapshot.resumeLabel}
            </button>
            {snapshot.onQuit && snapshot.quitLabel && (
              <button
                type="button"
                className="pause-button pause-button--secondary"
                onClick={handleQuit}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'quit' ? 'Quitting…' : snapshot.quitLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            className="pause-theme-toggle"
            onClick={(event) => {
              event.stopPropagation();
              toggleTheme();
            }}
          >
            {themeLabel} · Shift+C
          </button>
        </footer>
      </div>
    </div>
  );
};
