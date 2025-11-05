import { useMemo, type CSSProperties } from 'react';
import type { HudEntropyActionDescriptor, HudScoreboardPrompt } from 'render/hud';

import { useHud } from './state/game-bridge';

const formatScore = (score: number): string => {
  if (!Number.isFinite(score) || score <= 0) {
    return '0';
  }
  return score.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const formatCoins = (coins: number): string => {
  if (!Number.isFinite(coins) || coins <= 0) {
    return '0c';
  }
  return `${coins.toLocaleString(undefined, { maximumFractionDigits: 0 })}c`;
};

const formatLives = (lives: number): string => {
  if (!Number.isFinite(lives) || lives <= 0) {
    return '—';
  }
  const clamped = Math.min(Math.floor(lives), 10);
  return '❤'.repeat(clamped);
};

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

const formatEntropyDetail = (descriptor: HudEntropyActionDescriptor): string => {
  const cost = Math.max(0, Math.round(descriptor.cost));
  const status =
    descriptor.charges > 0
      ? `Charges ×${descriptor.charges}`
      : descriptor.affordable
        ? 'Ready'
        : 'Locked';
  return `${descriptor.hotkey.toUpperCase()} · Cost ${cost}% · ${status}`;
};

const isEntropyActionAvailable = (descriptor: HudEntropyActionDescriptor): boolean =>
  descriptor.charges > 0 || descriptor.affordable;

const momentumDescriptor = [
  { key: 'comboHeat', label: 'Heat' },
  { key: 'speedPressure', label: 'Speed' },
  { key: 'brickDensity', label: 'Field' },
] as const;

export const HudApp = (): JSX.Element | null => {
  const {
    score,
    lives,
    coins,
    combo,
    comboPulse,
    fps,
    difficultyMultiplier,
    comboTimer,
    brickRemaining,
    brickTotal,
    scoreboard,
    activePowerUps,
    reward,
    entropyActions,
    momentum,
    visible,
    attemptEntropyAction,
  } = useHud();

  const fpsLabel = useMemo(() => {
    if (typeof fps !== 'number' || !Number.isFinite(fps)) {
      return '';
    }
    return `${Math.round(fps)} fps`;
  }, [fps]);

  const comboPulseStyle = useMemo(() => {
    const safePulse = Number.isFinite(comboPulse) ? Math.max(0, Math.min(comboPulse, 1.6)) : 0;
    return { '--combo-pulse': safePulse } as CSSProperties;
  }, [comboPulse]);

  if (!visible || !scoreboard) {
    return null;
  }

  const secondaryEntries = scoreboard.entries.filter(
    (entry) =>
      entry.id !== 'score' &&
      entry.id !== 'coins' &&
      entry.id !== 'lives' &&
      entry.id !== 'momentum' &&
      entry.id !== 'entropy-actions' &&
      entry.id !== 'bricks',
  );

  const summaryCoins = formatCoins(coins);
  const summaryLives = formatLives(lives);

  const comboTimerLabel =
    Number.isFinite(comboTimer) && comboTimer > 0
      ? `${comboTimer.toFixed(1)}s window`
      : 'Window closed';

  const brickProgress = brickTotal > 0 ? clampUnit(1 - brickRemaining / brickTotal) : 0;
  const remainingLabel = `${brickRemaining} / ${brickTotal > 0 ? brickTotal : 0}`;

  return (
    <div className="hud-layout">
      {/* TOP BAR */}
      <section className="hud-top ui-interactive" aria-live="polite">
        <header className="hud-header">
          <div className="hud-status-text">{scoreboard.statusText}</div>
          {scoreboard.summaryLine && <div className="hud-summary">{scoreboard.summaryLine}</div>}
        </header>

        <div className="hud-primary-metrics">
          <div className="hud-score">Score {formatScore(score)}</div>
          {combo > 0 && (
            <div className="hud-combo" style={comboPulseStyle}>
              <span className="hud-combo-value">Combo ×{combo}</span>
              <span className="hud-combo-timer">{comboTimerLabel}</span>
            </div>
          )}
        </div>

        <section className="hud-bricks" aria-label="Brick progress">
          <div className="hud-bricks-label">Bricks {remainingLabel}</div>
          <div
            className="hud-bricks-bar"
            role="progressbar"
            aria-valuenow={Math.round(brickProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="hud-bricks-fill"
              style={{ width: `${Math.round(brickProgress * 100)}%` }}
            />
          </div>
        </section>
      </section>

      {/* RIGHT RAIL */}
      <aside className="hud-right ui-interactive">
        {momentum && (
          <section className="hud-momentum" aria-label="Momentum metrics">
            <h3>Momentum</h3>
            <ul>
              {momentumDescriptor.map((descriptor) => {
                const value = clampUnit(momentum[descriptor.key]);
                const percent = Math.round(value * 100);
                return (
                  <li key={descriptor.key}>
                    <span className="hud-momentum-label">{descriptor.label}</span>
                    <div className="hud-momentum-bar" role="presentation">
                      <div className="hud-momentum-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="hud-momentum-value">{percent}%</span>
                  </li>
                );
              })}
            </ul>
            <div className="hud-momentum-volley">
              Volley {Math.max(0, Math.round(momentum.volleyLength))}
            </div>
          </section>
        )}

        {entropyActions.length > 0 && (
          <section className="hud-entropy" aria-label="Entropy actions">
            <h3>Entropy Actions</h3>
            <ul>
              {entropyActions.map((entry) => {
                const available = isEntropyActionAvailable(entry);
                const variantClass =
                  entry.charges > 0
                    ? ' hud-entropy-action--charged'
                    : available
                      ? ' hud-entropy-action--ready'
                      : ' hud-entropy-action--locked';
                const disabled = !available || !attemptEntropyAction;
                return (
                  <li key={entry.action}>
                    <button
                      type="button"
                      className={`hud-entropy-action${variantClass}`}
                      onClick={() => {
                        if (disabled || !attemptEntropyAction) {
                          return;
                        }
                        attemptEntropyAction(entry.action);
                      }}
                      disabled={disabled}
                    >
                      <span className="hud-entropy-label">{entry.label}</span>
                      <span className="hud-entropy-detail">{formatEntropyDetail(entry)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {activePowerUps.length > 0 && (
          <section className="hud-powerups" aria-label="Active power ups">
            <h3>Power-Ups</h3>
            <ul>
              {activePowerUps.map((powerUp, index) => (
                <li key={`${powerUp.label}-${index}`}>
                  <span className="hud-powerup-label">{powerUp.label}</span>
                  <span className="hud-powerup-remaining">{powerUp.remaining}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {secondaryEntries.length > 0 && (
          <dl className="hud-entry-list">
            {secondaryEntries.map((entry) => (
              <div className="hud-entry" key={entry.id}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>

      {/* BOTTOM BAR */}
      <section className="hud-bottom ui-interactive" aria-live="polite">
        <div className="hud-bottom-left">
          {reward ? (
            <div className="hud-reward" aria-label="Reward status">
              <span className="hud-reward-label">{reward.label}</span>
              {reward.remaining ? (
                <span className="hud-reward-remaining">{reward.remaining}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="hud-bottom-right">
          <div className="hud-difficulty">Difficulty ×{difficultyMultiplier.toFixed(2)}</div>
          {fpsLabel && (
            <div className="hud-fps" aria-label="Frame rate">
              {fpsLabel}
            </div>
          )}
          <div className="hud-primary-row">
            <span className="hud-primary-metric" aria-label="Lives">
              {summaryLives}
            </span>
            <span className="hud-primary-metric" aria-label="Coins">
              {summaryCoins}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
