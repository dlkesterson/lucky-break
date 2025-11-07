import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BiasPhaseSessionSummary } from 'scenes/bias-phase';
import type { BiasPhaseSceneOption } from 'scenes/bias-phase';
import { Button, Panel, cn } from '@lucky-break/design-system';
import { useBiasPhaseUi } from '../state/bias-phase-bridge';
import { useGameTheme } from '../hooks/useGameTheme';

const riskLabel: Record<BiasPhaseSceneOption['risk'], string> = {
  tilt: 'Safe',
  lock: 'Steady',
  reforge: 'Bold',
};

interface ScoreboardEntry {
  readonly label: string;
  readonly resolve: (session: BiasPhaseSessionSummary) => string;
}

const trimTrailingZeros = (value: string): string =>
  value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

const formatNumber = (value: number): string => value.toLocaleString();

const formatSignedDelta = (value: number, decimals = 2): string => {
  if (!Number.isFinite(value)) {
    return '+/-0';
  }
  const threshold = 10 ** -decimals;
  if (Math.abs(value) < threshold) {
    return '+/-0';
  }
  const formatted = trimTrailingZeros(Math.abs(value).toFixed(decimals));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

const formatGravityBias = (session: BiasPhaseSessionSummary): string => {
  const value = trimTrailingZeros(session.gravity.toFixed(2));
  const delta = formatSignedDelta(session.gravityDelta, 2);
  return `${value}g (${delta})`;
};

const formatSpeedBias = (session: BiasPhaseSessionSummary): string => {
  const multiplier = trimTrailingZeros(session.speedGovernor.toFixed(2));
  const delta = formatSignedDelta(session.speedDelta, 2);
  return `×${multiplier} (${delta})`;
};

const scoreboardEntries: readonly ScoreboardEntry[] = [
  { label: 'Next Level', resolve: (session) => `Level ${session.nextLevel}` },
  { label: 'Score', resolve: (session) => formatNumber(session.score) },
  { label: 'Coins', resolve: (session) => formatNumber(session.coins) },
  { label: 'Lives', resolve: (session) => `${session.lives}` },
  { label: 'Highest Combo', resolve: (session) => `×${session.highestCombo}` },
  { label: 'Entropy Delta', resolve: (session) => formatSignedDelta(session.entropyDelta, 0) },
  { label: 'Entropy Reserve', resolve: (session) => formatNumber(session.entropyStored) },
  { label: 'Gravity Bias', resolve: formatGravityBias },
  { label: 'Speed Bias', resolve: formatSpeedBias },
  { label: 'Coins Rule', resolve: (session) => (session.coinsRuleLocked ? 'Locked' : 'Off') },
] as const;

export const BiasPhaseApp = (): JSX.Element | null => {
  const { theme } = useGameTheme();
  const { visible, suspended, payload } = useBiasPhaseUi();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'commit' | 'skip' | null>(null);

  useEffect(() => {
    setSelectedOptionId(null);
    setPendingAction(null);
  }, [payload]);

  const overlayStyle = useMemo(
    () =>
      ({
        '--bias-bg-from': theme.background.from,
        '--bias-bg-to': theme.background.to,
        '--bias-panel-fill': theme.hud.panelFill,
        '--bias-panel-line': theme.hud.panelLine,
        '--bias-text-primary': theme.hud.textPrimary,
        '--bias-text-secondary': theme.hud.textSecondary,
        '--bias-accent-combo': theme.accents.combo,
        '--bias-accent-power': theme.accents.powerUp,
        '--bias-accent-danger': theme.hud.danger,
      }) as CSSProperties,
    [theme],
  );

  const surfaceStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(160deg, rgba(26, 18, 48, 0.94), rgba(40, 24, 68, 0.78))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const scoreboardStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(24, 16, 40, 0.86), rgba(36, 22, 58, 0.72))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const optionStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(155deg, rgba(32, 22, 58, 0.84), rgba(20, 14, 36, 0.78))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  if (!visible || suspended || !payload) {
    return null;
  }

  const { session, options, onSelect, onSkip } = payload;
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;
  const entropyShortfall = selectedOption
    ? Math.max(0, selectedOption.wager.cost - session.entropyStored)
    : 0;
  const commitDisabled = !selectedOptionId || pendingAction !== null || entropyShortfall > 0;
  const commitLabel = (() => {
    if (pendingAction === 'commit') {
      return 'Committing…';
    }
    if (!selectedOptionId || !selectedOption) {
      return 'Commit Selection';
    }
    if (entropyShortfall > 0) {
      return `Need ${entropyShortfall} more entropy`;
    }
    return `Commit ${selectedOption.label}`;
  })();

  const handleCommit = async () => {
    if (!selectedOptionId || pendingAction) {
      return;
    }
    try {
      setPendingAction('commit');
      await onSelect(selectedOptionId);
    } catch (error) {
      console.error('Failed to commit bias selection', error);
      setPendingAction(null);
    }
  };

  const handleSkip = async () => {
    if (!onSkip || pendingAction) {
      return;
    }
    try {
      setPendingAction('skip');
      await onSkip();
    } catch (error) {
      console.error('Failed to skip bias selection', error);
      setPendingAction(null);
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] flex items-stretch justify-center px-4 py-6 sm:py-10"
      style={overlayStyle}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 55%), radial-gradient(circle at 80% 15%, rgba(255, 200, 120, 0.15), transparent 60%), linear-gradient(160deg, rgba(0,0,0,0.6), rgba(0,0,0,0.62))',
          mixBlendMode: 'lighten',
        }}
      />
      <div
        className="ui-interactive relative flex w-full max-w-[1120px] flex-col gap-6 overflow-hidden rounded-[32px] border px-6 py-8 text-[color:var(--bias-text-primary,#fbeedd)] shadow-[0_32px_68px_rgba(10,5,25,0.48)] backdrop-blur-2xl sm:gap-8 sm:px-10 sm:py-10"
        style={surfaceStyle}
      >
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-[clamp(42px,6vw,72px)] uppercase tracking-[0.06em] text-[color:var(--bias-accent-combo,#ffd45c)] drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
            Luck Architect&apos;s Casino
          </h1>
          <p className="text-[clamp(16px,2.2vmin,22px)] tracking-[0.04em] text-[color:var(--bias-text-secondary,#ffc45a)]">
            Stake your trajectory before the next volley
          </p>
        </header>

        <Panel
          tone="muted"
          aria-label="Run summary"
          className="ui-interactive grid gap-4 rounded-[24px] border"
          style={scoreboardStyle}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scoreboardEntries.map((entry) => (
              <div className="flex flex-col gap-1.5" key={entry.label}>
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-[rgba(255,224,180,0.68)]">
                  {entry.label}
                </span>
                <span className="text-[clamp(16px,2.2vmin,26px)] font-semibold tracking-wide">
                  {entry.resolve(session)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <section className="grid gap-6 md:grid-cols-2" aria-label="Entropy tables">
          {options.map((option) => {
            const selected = option.id === selectedOptionId;
            const disabled = pendingAction !== null;
            const locked = option.affordable === false;
            const riskColor =
              option.risk === 'tilt'
                ? 'var(--bias-accent-combo)'
                : option.risk === 'lock'
                  ? 'var(--bias-accent-power)'
                  : 'var(--bias-accent-danger)';

            return (
              <button
                type="button"
                key={option.id}
                className={cn(
                  'ui-interactive flex h-full flex-col gap-4 rounded-[24px] border p-6 text-left transition-all duration-200',
                  'hover:-translate-y-1 hover:border-[color:var(--bias-accent-combo,#ffd45c)] hover:shadow-[0_18px_36px_rgba(255,212,92,0.18)] focus-visible:-translate-y-1',
                  selected
                    ? 'border-[color:var(--bias-accent-combo,#ffd45c)] shadow-[0_18px_36px_rgba(255,212,92,0.18)]'
                    : 'border-white/10',
                  locked ? 'opacity-70' : null,
                )}
                style={optionStyle}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  setSelectedOptionId(option.id);
                }}
                disabled={disabled}
              >
                <span
                  className="inline-flex w-fit items-center justify-center rounded-full px-4 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.18em] text-stone-950"
                  style={{ backgroundColor: riskColor }}
                >
                  {riskLabel[option.risk]}
                </span>
                <span className="text-[clamp(20px,2.6vmin,32px)] font-extrabold tracking-[0.04em]">
                  {option.label}
                </span>
                <p className="text-[clamp(14px,1.6vmin,18px)] leading-relaxed text-[color:var(--bias-text-secondary,#ffc45a)]">
                  {option.description}
                </p>
                <span
                  className="font-mono text-xs uppercase tracking-[0.14em] text-[rgba(255,224,180,0.78)]"
                  aria-label={`Costs ${option.wager.cost} entropy`}
                >
                  {option.wager.label}
                </span>
                <div className="flex flex-col gap-2 text-[clamp(13px,1.4vmin,16px)] text-[color:var(--bias-text-primary,#fbeedd)]">
                  {option.effectSummary.map((line, index) => (
                    <span
                      key={`${option.id}-effect-${index}`}
                      className="before:text-[rgba(255,224,180,0.9)] before:content-['•\00a0']"
                    >
                      {line}
                    </span>
                  ))}
                </div>
                <span
                  className={cn(
                    'mt-auto text-xs uppercase tracking-[0.12em] text-[rgba(255,224,180,0.92)]',
                    locked && 'text-[rgba(255,168,168,0.92)]',
                  )}
                >
                  {locked
                    ? 'Earn more entropy to unlock'
                    : selected
                      ? 'Selected — tap to change'
                      : 'Tap to select this table'}
                </span>
              </button>
            );
          })}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm text-[rgba(255,224,180,0.82)]" aria-live="polite">
              {session.seed !== null ? `Seed #${session.seed}` : 'Seed pending — commit to lock'}
            </div>
            {onSkip && (
              <Button
                variant="ghost"
                className="ui-interactive w-fit rounded-full border border-white/20 text-xs uppercase tracking-[0.12em] text-[color:var(--bias-text-secondary,#ffc45a)] hover:text-[color:var(--bias-accent-power,#ff7b33)]"
                onClick={handleSkip}
                disabled={pendingAction !== null}
                size="sm"
              >
                Hold for default path
              </Button>
            )}
          </div>
          <Button
            className="ui-interactive min-w-[220px] rounded-full border-2 border-[color:var(--bias-accent-combo,#ffd45c)] bg-gradient-to-br from-[rgba(255,212,92,0.92)] to-[rgba(255,160,67,0.92)] text-base font-extrabold tracking-wide text-stone-950 shadow-[0_18px_42px_rgba(255,212,92,0.32)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            onClick={handleCommit}
            disabled={commitDisabled}
            size="lg"
          >
            {commitLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
};
