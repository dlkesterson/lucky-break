import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BiasPhaseSessionSummary } from 'scenes/bias-phase';
import type { BiasPhaseSceneOption } from 'scenes/bias-phase';
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
    <div className="bias-phase-overlay" style={overlayStyle}>
      <div className="bias-phase-backdrop" />
      <div className="bias-phase-surface ui-interactive">
        <header className="bias-phase-header">
          <h1>Luck Architect&apos;s Casino</h1>
          <p>Stake your trajectory before the next volley</p>
        </header>

        <section className="bias-phase-scoreboard" aria-label="Run summary">
          {scoreboardEntries.map((entry) => (
            <div className="bias-phase-score" key={entry.label}>
              <span className="bias-phase-score-label">{entry.label}</span>
              <span className="bias-phase-score-value">{entry.resolve(session)}</span>
            </div>
          ))}
        </section>

        <section className="bias-phase-options" aria-label="Entropy tables">
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
                className={`bias-phase-card${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  setSelectedOptionId(option.id);
                }}
                disabled={disabled}
              >
                <span className="bias-phase-card-risk" style={{ backgroundColor: riskColor }}>
                  {riskLabel[option.risk]}
                </span>
                <span className="bias-phase-card-title">{option.label}</span>
                <span className="bias-phase-card-description">{option.description}</span>
                <span
                  className="bias-phase-card-wager"
                  aria-label={`Costs ${option.wager.cost} entropy`}
                >
                  {option.wager.label}
                </span>
                <span className="bias-phase-card-effects">
                  {option.effectSummary.map((line, index) => (
                    <span key={`${option.id}-effect-${index}`}>{line}</span>
                  ))}
                </span>
                <span className="bias-phase-card-callout">
                  {locked ? 'Earn more entropy to unlock' : 'Tap to select this table'}
                </span>
              </button>
            );
          })}
        </section>

        <footer className="bias-phase-footer">
          <div className="bias-phase-footer-left">
            <div className="bias-phase-seed" aria-live="polite">
              {session.seed !== null ? `Seed #${session.seed}` : 'Seed pending — commit to lock'}
            </div>
            {onSkip && (
              <button
                type="button"
                className="bias-phase-skip"
                onClick={handleSkip}
                disabled={pendingAction !== null}
              >
                Hold for default path
              </button>
            )}
          </div>
          <button
            type="button"
            className="bias-phase-commit"
            onClick={handleCommit}
            disabled={commitDisabled}
          >
            {commitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};
