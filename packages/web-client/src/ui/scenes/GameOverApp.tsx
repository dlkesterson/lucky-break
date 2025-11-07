import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Panel } from '@lucky-break/design-system';

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

  const backdropStyle = useMemo(
    () =>
      ({
        background:
          'radial-gradient(circle at 20% 30%, rgba(255,146,132,0.24), transparent 58%), radial-gradient(circle at 80% 70%, rgba(118,176,255,0.18), transparent 52%), linear-gradient(158deg, rgba(10,6,18,0.92), rgba(18,10,28,0.78))',
      }) as CSSProperties,
    [],
  );

  const surfaceStyle = useMemo(
    () =>
      ({
        background:
          'linear-gradient(160deg, rgba(26,16,44,0.96), rgba(20,12,32,0.86)), linear-gradient(320deg, rgba(255,108,132,0.18), rgba(120,178,255,0.14))',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }) as CSSProperties,
    [],
  );

  const scorePanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(34,22,52,0.82), rgba(18,10,32,0.72))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const achievementsPanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(32,20,52,0.78), rgba(18,12,36,0.68))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
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
    <div
      className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-4 py-10 sm:px-6"
      style={overlayStyle}
      ref={overlayRef}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10" style={backdropStyle} />
      <div
        className="pointer-events-auto relative flex w-full max-w-[720px] flex-col gap-6 rounded-[36px] border px-6 py-8 text-[color:var(--game-over-text-primary,#f6f1ff)] shadow-[0_44px_120px_rgba(4,3,16,0.65)] backdrop-blur-2xl sm:gap-8 sm:px-10 sm:py-10"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <header className="flex flex-col items-center gap-4 text-center">
          <h1
            id="game-over-title"
            className="font-display text-[clamp(46px,6.4vw,84px)] uppercase tracking-[0.1em] text-[color:var(--game-over-accent,#ff6c84)] drop-shadow-[0_16px_36px_rgba(0,0,0,0.65)]"
          >
            {snapshot.title}
          </h1>
          <p className="text-[clamp(14px,1.8vmin,18px)] tracking-[0.05em] text-[color:var(--game-over-text-secondary,#d8c6ff)]">
            {snapshot.scoreLabel}
          </p>
        </header>

        <Panel
          tone="muted"
          aria-label="Run summary"
          className="pointer-events-auto grid gap-4 rounded-[28px]"
          style={scorePanelStyle}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-white/70">
                Final Score
              </span>
              <span className="text-[clamp(36px,5.4vmin,60px)] font-extrabold">
                {formatScore(snapshot.score)}
              </span>
            </div>
            {dustLabel ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-white/70">
                  Certainty Dust
                </span>
                <span className="text-[clamp(26px,3.8vmin,40px)] font-bold text-[color:var(--game-over-highlight,#ffd45c)]">
                  {dustLabel}
                </span>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          tone="muted"
          aria-label="Achievements unlocked"
          className="pointer-events-auto flex flex-col gap-4 rounded-[28px]"
          style={achievementsPanelStyle}
        >
          {snapshot.achievements.length > 0 ? (
            <>
              <h2 className="font-display text-[clamp(20px,2.6vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--game-over-highlight,#ffd45c)]">
                Achievements Unlocked
              </h2>
              <ul className="flex flex-col gap-3 text-sm text-[color:var(--game-over-text-primary,#f6f1ff)]">
                {snapshot.achievements.map((achievement) => (
                  <li key={achievement.id} className="flex flex-col gap-1">
                    <span className="font-semibold tracking-[0.04em]">{achievement.title}</span>
                    <span className="text-[color:var(--game-over-text-secondary,#d8c6ff)]">
                      {achievement.description}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[color:var(--game-over-text-secondary,#d8c6ff)]">
              No new achievements this run — fortune favours persistence.
            </p>
          )}
        </Panel>

        <Button
          className="ui-interactive mx-auto mt-2 min-w-[220px] rounded-full border-2 border-[rgba(255,202,140,0.6)] bg-gradient-to-br from-[rgba(255,198,108,0.95)] to-[rgba(255,146,132,0.95)] text-lg font-extrabold uppercase tracking-[0.12em] text-stone-900 shadow-[0_30px_60px_rgba(255,172,140,0.45)] transition-transform duration-150 hover:-translate-y-1 focus-visible:-translate-y-1 disabled:translate-y-0 disabled:opacity-65"
          onClick={handleRestart}
          disabled={pending}
          size="lg"
        >
          {pending ? 'Returning…' : snapshot.prompt}
        </Button>
      </div>
    </div>
  );
};
