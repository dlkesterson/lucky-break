import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Panel, Heading, Label, Mono, cn } from '@lucky-break/design-system';
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

  const surfaceStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(160deg, rgba(20, 12, 36, 0.95), rgba(42, 20, 60, 0.82))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const panelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(155deg, rgba(30, 18, 52, 0.85), rgba(16, 10, 28, 0.78))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const prologueStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(160deg, rgba(34, 20, 56, 0.92), rgba(18, 10, 30, 0.82))',
      }) as CSSProperties,
    [],
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

  const actionButtonClass =
    'ui-interactive rounded-full border border-white/20 bg-white/10 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--menu-text-primary,#ffe9d6)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5';

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
    <div
      className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-4 py-10 sm:px-6"
      style={overlayStyle}
      ref={overlayRef}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 18% 78%, rgba(255, 156, 80, 0.22), transparent 58%), radial-gradient(circle at 82% 24%, rgba(120, 190, 255, 0.18), transparent 52%), linear-gradient(150deg, rgba(12, 8, 26, 0.92), rgba(22, 12, 38, 0.88))',
        }}
      />
      <div
        className="pointer-events-auto ui-interactive relative flex w-full max-w-[980px] flex-col gap-8 rounded-[32px] border px-6 pb-10 pt-8 text-[color:var(--menu-text-primary,#ffe9d6)] shadow-[0_36px_72px_rgba(8,4,18,0.6)] backdrop-blur-2xl sm:gap-10 sm:px-10 sm:pb-12 sm:pt-10"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="main-menu-title"
      >
        <header className="flex flex-col items-center gap-4 text-center sm:gap-5">
          <Heading
            id="main-menu-title"
            className="text-[clamp(48px,6vw,92px)] uppercase tracking-[0.08em] text-[color:var(--menu-accent,#ffd04a)] drop-shadow-[0_12px_26px_rgba(0,0,0,0.5)]"
          >
            {snapshot.title}
          </Heading>
          <Button
            className="ui-interactive mt-2 w-full max-w-xs rounded-full border-2 border-[color:var(--menu-panel-line,#ff9242)] bg-gradient-to-br from-[rgba(255,210,110,0.9)] via-[rgba(255,240,190,0.95)] to-[rgba(255,164,70,0.92)] text-lg font-black uppercase tracking-[0.08em] text-stone-950 shadow-[0_20px_40px_rgba(255,214,110,0.32)] transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:-translate-y-1 disabled:translate-y-0"
            onClick={handleStart}
            disabled={pendingStart}
            size="lg"
            variant="default"
          >
            {pendingStart ? 'Starting…' : snapshot.prompt}
          </Button>
        </header>

        <div className="grid gap-6 sm:grid-cols-2" aria-live="polite">
          {snapshot.prologue ? (
            <Panel
              tone="muted"
              aria-label={snapshot.prologue.heading}
              className="ui-interactive col-span-full space-y-4 rounded-[28px] border text-[color:var(--menu-text-secondary,#ffc45a)]"
              style={{ ...panelStyle, ...prologueStyle }}
            >
              <Heading className="text-[clamp(20px,2.2vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
                {snapshot.prologue.heading}
              </Heading>
              {snapshot.prologue.body.map((paragraph, index) => (
                <Label
                  key={`main-menu-prologue-${index}`}
                  className="font-sans text-[clamp(14px,1.8vmin,18px)] leading-relaxed tracking-[0.03em]"
                >
                  {paragraph}
                </Label>
              ))}
            </Panel>
          ) : null}

          <Panel
            tone="muted"
            aria-label="How to play"
            className="ui-interactive h-full space-y-4 rounded-[28px] border text-[color:var(--menu-text-secondary,#ffc45a)]"
            style={panelStyle}
          >
            <Heading className="text-[clamp(20px,2.2vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
              How to Play
            </Heading>
            <ul className="flex list-disc flex-col gap-3 pl-6 text-[clamp(14px,1.7vmin,18px)] leading-relaxed">
              {snapshot.helpLines.map((line, index) => (
                <li key={`main-menu-help-${index}`}>{line}</li>
              ))}
            </ul>
          </Panel>

          <Panel
            tone="muted"
            aria-label="High scores"
            className="ui-interactive h-full space-y-4 rounded-[28px] border text-[color:var(--menu-text-primary,#ffe9d6)]"
            style={panelStyle}
          >
            <Heading className="text-[clamp(20px,2.2vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
              High Scores
            </Heading>
            {scores.length > 0 ? (
              <ol className="flex flex-col gap-3 text-[clamp(14px,1.7vmin,18px)] tracking-[0.04em]">
                {scores.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[36px_minmax(0,110px)_54px_minmax(0,1fr)] items-baseline gap-3 sm:grid-cols-[42px_minmax(0,120px)_60px_minmax(0,1fr)]"
                  >
                    <Mono className="text-sm text-[color:var(--menu-text-secondary,#ffc45a)]">
                      {entry.rank}.
                    </Mono>
                    <span className="font-semibold">{entry.scoreLabel}</span>
                    <span className="text-[color:var(--menu-text-secondary,#ffc45a)]">
                      {entry.roundLabel}
                    </span>
                    <span className="truncate uppercase">{entry.name}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Label className="text-[clamp(14px,1.6vmin,18px)] text-[color:var(--menu-text-secondary,#ffc45a)]">
                No runs recorded yet — your first streak awaits.
              </Label>
            )}
          </Panel>
        </div>

        <footer className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              className={actionButtonClass}
              onClick={handleShowStory}
              variant="outline"
              size="sm"
            >
              Story So Far
            </Button>
            <Button
              className={actionButtonClass}
              onClick={handleToggleTheme}
              variant="outline"
              size="sm"
            >
              Color Mode: {themeLabel} · Shift+C
            </Button>
            <Button
              className={actionButtonClass}
              onClick={handleTogglePerformance}
              variant="outline"
              size="sm"
            >
              Performance Mode: {performanceLabel}
            </Button>
            <Button
              className={actionButtonClass}
              onClick={handleOpenLedger}
              variant="outline"
              size="sm"
            >
              View Fate Ledger
            </Button>
          </div>
          <Label className="font-sans text-xs uppercase tracking-[0.12em] text-white/60">
            Tip: Toggle performance mode if your device needs a lighter glow.
          </Label>
        </footer>
      </div>
    </div>
  );
};
