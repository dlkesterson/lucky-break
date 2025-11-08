import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Heading, Label, Mono } from '@lucky-break/design-system';
import type { GameThemeDefinition, ThemeName } from 'render/theme';

export interface MainMenuScore {
  readonly id: string;
  readonly rank: number;
  readonly name: string;
  readonly score: number;
  readonly round: number;
}

export interface MainMenuPrologue {
  readonly heading: string;
  readonly body: readonly string[];
}

export interface MainMenuViewProps {
  readonly visible: boolean;
  readonly title: string;
  readonly prompt: string;
  readonly prologue: MainMenuPrologue | null;
  readonly helpLines: readonly string[];
  readonly scores: readonly MainMenuScore[];
  readonly performanceEnabled: boolean;
  readonly pendingStart: boolean;
  readonly theme: GameThemeDefinition;
  readonly themeName: ThemeName;
  readonly onStart: () => void;
  readonly onTogglePerformance: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenLedger: () => void;
  readonly onShowStory: () => void;
  readonly overlayRef?: React.RefObject<HTMLDivElement>;
}

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

const getThemeLabelFromName = (name: ThemeName): string => {
  const labels: Record<ThemeName, string> = {
    default: 'Vibrant',
    colorBlind: 'High Contrast',
  };
  return labels[name] ?? 'Vibrant';
};

export const MainMenuView = ({
  visible,
  title,
  prompt,
  prologue,
  helpLines,
  scores: rawScores,
  performanceEnabled,
  pendingStart,
  theme,
  themeName,
  onStart,
  onTogglePerformance,
  onToggleTheme,
  onOpenLedger,
  onShowStory,
  overlayRef,
}: MainMenuViewProps): JSX.Element | null => {
  const { t } = useTranslation();

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
    return rawScores.map((entry) => ({
      id: entry.id,
      rank: entry.rank,
      name: entry.name,
      scoreLabel: formatScoreValue(entry.score),
      roundLabel: formatRoundLabel(entry.round),
    }));
  }, [rawScores]);

  const actionButtonClass =
    'ui-interactive rounded-full border border-white/20 bg-white/10 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--menu-text-primary,#ffe9d6)] transition-transform duration-150 [touch-action:manipulation] hover:-translate-y-0.5 focus-visible:-translate-y-0.5';

  if (!visible) {
    return null;
  }

  const performanceLabel = performanceEnabled
    ? t('mainMenu.performanceMode.on')
    : t('mainMenu.performanceMode.off');
  const themeLabel = getThemeLabelFromName(themeName);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-3 py-6 sm:px-4 sm:py-10 md:px-6"
      style={overlayStyle}
      ref={overlayRef}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 18% 78%, rgba(255, 156, 80, 0.22), transparent 58%), radial-gradient(circle at 82% 24%, rgba(120, 190, 255, 0.18), transparent 52%), linear-gradient(150deg, rgba(12, 8, 26, 0.92), rgba(22, 12, 38, 0.88))',
        }}
      />
      <div
        className="pointer-events-auto ui-interactive relative z-10 flex w-full max-w-[980px] flex-col gap-6 rounded-[24px] border px-4 pb-8 pt-6 text-[color:var(--menu-text-primary,#ffe9d6)] shadow-[0_36px_72px_rgba(8,4,18,0.6)] backdrop-blur-2xl [touch-action:auto] sm:gap-8 sm:rounded-[32px] sm:px-6 sm:pb-10 sm:pt-8 md:gap-10 md:px-10 md:pb-12 md:pt-10"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="main-menu-title"
      >
        <header className="flex flex-col items-center gap-3 text-center sm:gap-4 md:gap-5">
          <Heading
            id="main-menu-title"
            className="text-[clamp(36px,8vw,92px)] uppercase leading-tight tracking-[0.08em] text-[color:var(--menu-accent,#ffd04a)] drop-shadow-[0_12px_26px_rgba(0,0,0,0.5)]"
          >
            {title}
          </Heading>
          <Button
            className="ui-interactive mt-1 w-full max-w-xs rounded-full border-2 border-[color:var(--menu-panel-line,#ff9242)] bg-gradient-to-br from-[rgba(255,210,110,0.9)] via-[rgba(255,240,190,0.95)] to-[rgba(255,164,70,0.92)] px-6 py-3 text-base font-black uppercase tracking-[0.08em] text-stone-950 shadow-[0_20px_40px_rgba(255,214,110,0.32)] transition-transform duration-150 ease-out [touch-action:manipulation] hover:-translate-y-1 focus-visible:-translate-y-1 disabled:translate-y-0 sm:px-8 sm:text-lg md:mt-2"
            onClick={onStart}
            disabled={pendingStart}
            size="lg"
            variant="default"
          >
            {pendingStart ? t('mainMenu.startingButton') : prompt}
          </Button>
        </header>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2" aria-live="polite">
          {prologue ? (
            <Panel
              tone="muted"
              aria-label={prologue.heading}
              className="ui-interactive col-span-full space-y-3 rounded-[20px] border text-[color:var(--menu-text-secondary,#ffc45a)] sm:space-y-4 sm:rounded-[28px]"
              style={{ ...panelStyle, ...prologueStyle }}
            >
              <Heading className="text-[clamp(18px,2.6vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
                {prologue.heading}
              </Heading>
              {prologue.body.map((paragraph, index) => (
                <Label
                  key={`main-menu-prologue-${index}`}
                  className="font-sans text-[clamp(13px,1.9vmin,18px)] leading-relaxed tracking-[0.03em]"
                >
                  {paragraph}
                </Label>
              ))}
            </Panel>
          ) : null}

          <Panel
            tone="muted"
            aria-label={t('mainMenu.howToPlay.heading')}
            className="ui-interactive h-full space-y-3 rounded-[20px] border text-[color:var(--menu-text-secondary,#ffc45a)] sm:space-y-4 sm:rounded-[28px]"
            style={panelStyle}
          >
            <Heading className="text-[clamp(18px,2.6vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
              {t('mainMenu.howToPlay.heading')}
            </Heading>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[clamp(13px,1.8vmin,18px)] leading-relaxed sm:gap-3 sm:pl-6">
              {helpLines.map((line, index) => (
                <li key={`main-menu-help-${index}`}>{line}</li>
              ))}
            </ul>
          </Panel>

          <Panel
            tone="muted"
            aria-label={t('mainMenu.highScores.heading')}
            className="ui-interactive h-full space-y-3 rounded-[20px] border text-[color:var(--menu-text-primary,#ffe9d6)] sm:space-y-4 sm:rounded-[28px]"
            style={panelStyle}
          >
            <Heading className="text-[clamp(18px,2.6vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--menu-power,#ff6b35)]">
              {t('mainMenu.highScores.heading')}
            </Heading>
            {scores.length > 0 ? (
              <ol className="flex flex-col gap-2 text-[clamp(13px,1.8vmin,18px)] tracking-[0.04em] sm:gap-3">
                {scores.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[28px_minmax(0,100px)_48px_minmax(0,1fr)] items-baseline gap-2 sm:grid-cols-[36px_minmax(0,110px)_54px_minmax(0,1fr)] sm:gap-3 md:grid-cols-[42px_minmax(0,120px)_60px_minmax(0,1fr)]"
                  >
                    <Mono className="text-xs text-[color:var(--menu-text-secondary,#ffc45a)] sm:text-sm">
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
              <Label className="text-[clamp(13px,1.7vmin,18px)] text-[color:var(--menu-text-secondary,#ffc45a)]">
                {t('mainMenu.highScores.emptyState')}
              </Label>
            )}
          </Panel>
        </div>

        <footer className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            <Button className={actionButtonClass} onClick={onShowStory} variant="outline" size="sm">
              {t('mainMenu.actions.showStory')}
            </Button>
            <Button
              className={actionButtonClass}
              onClick={onToggleTheme}
              variant="outline"
              size="sm"
            >
              {t('mainMenu.actions.toggleTheme', { theme: themeLabel })}
            </Button>
            <Button
              className={actionButtonClass}
              onClick={onTogglePerformance}
              variant="outline"
              size="sm"
            >
              {t('mainMenu.actions.togglePerformance', { status: performanceLabel })}
            </Button>
            <Button
              className={actionButtonClass}
              onClick={onOpenLedger}
              variant="outline"
              size="sm"
            >
              {t('mainMenu.actions.viewLedger')}
            </Button>
          </div>
          <Label className="font-sans text-[10px] uppercase tracking-[0.12em] text-white/60 sm:text-xs">
            {t('mainMenu.footer.tip')}
          </Label>
        </footer>
      </div>
    </div>
  );
};
