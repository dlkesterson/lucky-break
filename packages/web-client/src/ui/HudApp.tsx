import { useMemo, type CSSProperties } from 'react';

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
    momentum,
    visible,
    flavor,
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

  const flavorClass = useMemo(() => {
    if (!flavor) {
      return 'hud-flavor';
    }
    return `hud-flavor hud-flavor-${flavor.tone}`;
  }, [flavor]);

  if (!visible || !scoreboard) {
    return null;
  }

  const secondaryEntries = scoreboard.entries.filter(
    (entry) =>
      entry.id !== 'score' &&
      entry.id !== 'coins' &&
      entry.id !== 'lives' &&
      entry.id !== 'momentum' &&
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
      <section className="hud-top" aria-live="polite">
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
      <aside className="hud-right">
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
      <section className="hud-bottom" aria-live="polite">
        <div className="hud-bottom-left">
          {reward ? (
            <div className="hud-reward" aria-label="Reward status">
              <span className="hud-reward-label">{reward.label}</span>
              {reward.remaining ? (
                <span className="hud-reward-remaining">{reward.remaining}</span>
              ) : null}
            </div>
          ) : null}
          {flavor ? (
            <div className={flavorClass} aria-live="polite">
              {flavor.text}
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
