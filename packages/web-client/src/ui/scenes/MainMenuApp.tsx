import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getThemeLabel } from 'render/theme';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useMainMenuUi } from '../state/main-menu-bridge';

type ScoreViewModel = {
  readonly id: string;
  readonly rank: number;
  readonly name: string;
  readonly scoreLabel: string;
  readonly roundLabel: string;
};

const formatScoreValue = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return Math.floor(value).toLocaleString();
};

const formatRoundLabel = (round: number): string => {
  if (!Number.isFinite(round) || round <= 0) {
    return 'R1';
  }
  return `R${Math.max(1, Math.floor(round))}`;
};

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

  const overlayStyle = useMemo(
    () =>
      ({
        '--menu-bg-from': theme.background.from,
        '--menu-bg-to': theme.background.to,
        '--menu-panel-fill': theme.hud.panelFill,
        '--menu-panel-line': theme.hud.panelLine,
        '--menu-text-primary': theme.hud.textPrimary,
        '--menu-text-secondary': theme.hud.textSecondary,
        '--menu-accent': theme.hud.accent,
        '--menu-power': theme.accents.powerUp,
      }) as CSSProperties,
    [theme],
  );

  const scores = useMemo<readonly ScoreViewModel[]>(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.scores.map((entry) => ({
      id: entry.id,
      rank: entry.rank,
      name: entry.name,
      scoreLabel: formatScoreValue(entry.score),
      roundLabel: formatRoundLabel(entry.round),
    }));
  }, [snapshot]);

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

  const performanceLabel = snapshot.performanceEnabled ? 'On' : 'Off';
  const themeLabel = getThemeLabel(themeName);

  return (
    <div className="main-menu-overlay" style={overlayStyle} ref={overlayRef}>
      <div className="main-menu-backdrop" />
      <div
        className="main-menu-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="main-menu-title"
      >
        <header className="main-menu-header">
          <h1 id="main-menu-title">{snapshot.title}</h1>
          <button
            type="button"
            className="main-menu-start ui-interactive"
            onClick={handleStart}
            disabled={pendingStart}
          >
            {pendingStart ? 'Starting…' : snapshot.prompt}
          </button>
        </header>

        <div className="main-menu-content" aria-live="polite">
          {snapshot.prologue ? (
            <section className="main-menu-prologue" aria-label={snapshot.prologue.heading}>
              <h2>{snapshot.prologue.heading}</h2>
              {snapshot.prologue.body.map((paragraph, index) => (
                <p key={`main-menu-prologue-${index}`}>{paragraph}</p>
              ))}
            </section>
          ) : null}

          <section className="main-menu-help" aria-label="How to play">
            <h2>How to Play</h2>
            <ul>
              {snapshot.helpLines.map((line, index) => (
                <li key={`main-menu-help-${index}`}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="main-menu-scores" aria-label="High scores">
            <h2>High Scores</h2>
            {scores.length > 0 ? (
              <ol>
                {scores.map((entry) => (
                  <li key={entry.id}>
                    <span className="main-menu-score-rank">{entry.rank}.</span>
                    <span className="main-menu-score-value">{entry.scoreLabel}</span>
                    <span className="main-menu-score-round">{entry.roundLabel}</span>
                    <span className="main-menu-score-name">{entry.name}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="main-menu-scores-empty">
                No runs recorded yet — your first streak awaits.
              </p>
            )}
          </section>
        </div>

        <footer className="main-menu-footer">
          <div className="main-menu-actions">
            <button
              type="button"
              className="main-menu-action ui-interactive"
              onClick={handleShowStory}
            >
              Story So Far
            </button>
            <button
              type="button"
              className="main-menu-action ui-interactive"
              onClick={handleToggleTheme}
            >
              Color Mode: {themeLabel} · Shift+C
            </button>
            <button
              type="button"
              className="main-menu-action ui-interactive"
              onClick={handleTogglePerformance}
            >
              Performance Mode: {performanceLabel}
            </button>
            <button
              type="button"
              className="main-menu-action ui-interactive"
              onClick={handleOpenLedger}
            >
              View Fate Ledger
            </button>
          </div>
          <p className="main-menu-footer-hint">
            Tip: Toggle performance mode if your device needs a lighter glow.
          </p>
        </footer>
      </div>
    </div>
  );
};
