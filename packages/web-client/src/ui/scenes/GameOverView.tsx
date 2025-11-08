import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Heading, Label, Mono } from '@lucky-break/design-system';
import type { GameThemeDefinition } from 'render/theme';

export interface GameOverAchievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface GameOverViewProps {
  readonly visible: boolean;
  readonly title: string;
  readonly scoreLabel: string;
  readonly score: number;
  readonly dustAwarded: number | null;
  readonly achievements: readonly GameOverAchievement[];
  readonly prompt: string;
  readonly pending: boolean;
  readonly theme: GameThemeDefinition;
  readonly onRestart: () => void;
  readonly overlayRef?: React.RefObject<HTMLDivElement>;
}

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

export const GameOverView = ({
  visible,
  title,
  scoreLabel,
  score,
  dustAwarded,
  achievements,
  prompt,
  pending,
  theme,
  onRestart,
  overlayRef,
}: GameOverViewProps): JSX.Element | null => {
  const { t } = useTranslation();

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

  if (!visible) {
    return null;
  }

  const dustLabel = formatDust(dustAwarded);
  const certaintyDustLabel = t('gameOver.certaintyDust');
  const achievementsTitle = t('gameOver.achievements.title');
  const achievementsEmptyState = t('gameOver.achievements.emptyState');

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-3 py-6 sm:px-4 sm:py-10 md:px-6"
      style={overlayStyle}
      ref={overlayRef}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={backdropStyle}
      />
      <div
        className="pointer-events-auto relative z-10 flex w-full max-w-[720px] flex-col gap-4 rounded-[28px] border px-4 py-6 text-[color:var(--game-over-text-primary,#f6f1ff)] shadow-[0_44px_120px_rgba(4,3,16,0.65)] backdrop-blur-2xl [touch-action:auto] sm:gap-6 sm:rounded-[36px] sm:px-6 sm:py-8 md:gap-8 md:px-10 md:py-10"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <header className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <Heading
            id="game-over-title"
            className="text-[clamp(40px,7.5vw,84px)] uppercase leading-tight tracking-[0.1em] text-[color:var(--game-over-accent,#ff6c84)] drop-shadow-[0_16px_36px_rgba(0,0,0,0.65)]"
          >
            {title}
          </Heading>
          <Label className="text-[clamp(13px,2vmin,18px)] tracking-[0.05em] text-[color:var(--game-over-text-secondary,#d8c6ff)]">
            {scoreLabel}
          </Label>
        </header>

        <Panel
          tone="muted"
          aria-label="Run summary"
          className="pointer-events-auto grid gap-3 rounded-[22px] sm:gap-4 sm:rounded-[28px]"
          style={scorePanelStyle}
        >
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="flex flex-col items-center gap-1.5 text-center sm:gap-2">
              <Mono className="text-[10px] uppercase tracking-[0.12em] text-white/70 sm:text-xs">
                {t('gameOver.scoreLabel')}
              </Mono>
              <span className="text-[clamp(32px,6vmin,60px)] font-extrabold">
                {formatScore(score)}
              </span>
            </div>
            {dustLabel ? (
              <div className="flex flex-col items-center gap-1.5 text-center sm:gap-2">
                <Mono className="text-[10px] uppercase tracking-[0.12em] text-white/70 sm:text-xs">
                  {certaintyDustLabel}
                </Mono>
                <span className="text-[clamp(24px,4.5vmin,40px)] font-bold text-[color:var(--game-over-highlight,#ffd45c)]">
                  {dustLabel}
                </span>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          tone="muted"
          aria-label="Achievements unlocked"
          className="pointer-events-auto flex flex-col gap-3 rounded-[22px] sm:gap-4 sm:rounded-[28px]"
          style={achievementsPanelStyle}
        >
          {achievements.length > 0 ? (
            <>
              <Heading className="text-[clamp(18px,3vmin,26px)] uppercase tracking-[0.06em] text-[color:var(--game-over-highlight,#ffd45c)]">
                {achievementsTitle}
              </Heading>
              <ul className="flex flex-col gap-2.5 text-sm text-[color:var(--game-over-text-primary,#f6f1ff)] sm:gap-3">
                {achievements.map((achievement) => (
                  <li key={achievement.id} className="flex flex-col gap-0.5 sm:gap-1">
                    <Label className="text-[clamp(14px,2vmin,16px)] font-semibold tracking-[0.04em]">
                      {achievement.title}
                    </Label>
                    <Label className="text-[clamp(12px,1.8vmin,14px)] text-[color:var(--game-over-text-secondary,#d8c6ff)]">
                      {achievement.description}
                    </Label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Label className="text-[clamp(13px,1.8vmin,14px)] text-[color:var(--game-over-text-secondary,#d8c6ff)]">
              {achievementsEmptyState}
            </Label>
          )}
        </Panel>

        <Button
          className="ui-interactive mx-auto mt-1 min-w-[200px] rounded-full border-2 border-[rgba(255,202,140,0.6)] bg-gradient-to-br from-[rgba(255,198,108,0.95)] to-[rgba(255,146,132,0.95)] px-6 py-3 text-base font-extrabold uppercase tracking-[0.12em] text-stone-900 shadow-[0_30px_60px_rgba(255,172,140,0.45)] transition-transform duration-150 [touch-action:manipulation] hover:-translate-y-1 focus-visible:-translate-y-1 disabled:translate-y-0 disabled:opacity-65 sm:min-w-[220px] sm:px-8 sm:text-lg md:mt-2"
          onClick={onRestart}
          disabled={pending}
          size="lg"
        >
          {prompt}
        </Button>
      </div>
    </div>
  );
};
