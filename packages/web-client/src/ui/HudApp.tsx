import { useMemo, type CSSProperties } from 'react';

import { Heading, Label, Mono, Progress } from '@lucky-break/design-system';

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
          <Label className="hud-status-text">{scoreboard.statusText}</Label>
          {scoreboard.summaryLine && (
            <Label className="hud-summary">{scoreboard.summaryLine}</Label>
          )}
        </header>

        <div className="hud-primary-metrics">
          <Heading className="hud-score">Score {formatScore(score)}</Heading>
          {combo > 0 && (
            <div className="hud-combo" style={comboPulseStyle}>
              <Mono className="hud-combo-value">Combo ×{combo}</Mono>
              <Mono className="hud-combo-timer">{comboTimerLabel}</Mono>
            </div>
          )}
        </div>

        <section className="hud-bricks" aria-label="Brick progress">
          <Mono className="hud-bricks-label">Bricks {remainingLabel}</Mono>
          <Progress
            value={brickProgress * 100}
            className="hud-bricks-bar"
            aria-label="Brick progress"
          />
        </section>
      </section>

      {/* RIGHT RAIL */}
      <aside className="hud-right">
        {momentum && (
          <section className="hud-momentum" aria-label="Momentum metrics">
            <Heading className="hud-momentum-title">Momentum</Heading>
            <ul>
              {momentumDescriptor.map((descriptor) => {
                const value = clampUnit(momentum[descriptor.key]);
                const percent = Math.round(value * 100);
                return (
                  <li key={descriptor.key}>
                    <Label className="hud-momentum-label">{descriptor.label}</Label>
                    <Progress
                      value={percent}
                      className="hud-momentum-bar"
                      aria-label={`${descriptor.label} momentum`}
                    />
                    <Mono className="hud-momentum-value">{percent}%</Mono>
                  </li>
                );
              })}
            </ul>
            <Mono className="hud-momentum-volley">
              Volley {Math.max(0, Math.round(momentum.volleyLength))}
            </Mono>
          </section>
        )}

        {activePowerUps.length > 0 && (
          <section className="hud-powerups" aria-label="Active power ups">
            <Heading className="hud-powerups-title">Power-Ups</Heading>
            <ul>
              {activePowerUps.map((powerUp, index) => (
                <li key={`${powerUp.label}-${index}`}>
                  <Label className="hud-powerup-label">{powerUp.label}</Label>
                  <Mono className="hud-powerup-remaining">{powerUp.remaining}</Mono>
                </li>
              ))}
            </ul>
          </section>
        )}

        {secondaryEntries.length > 0 && (
          <dl className="hud-entry-list">
            {secondaryEntries.map((entry) => (
              <div className="hud-entry" key={entry.id}>
                <Label className="hud-entry-label">{entry.label}</Label>
                <Mono className="hud-entry-value">{entry.value}</Mono>
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
              <Label className="hud-reward-label">{reward.label}</Label>
              {reward.remaining ? (
                <Mono className="hud-reward-remaining">{reward.remaining}</Mono>
              ) : null}
            </div>
          ) : null}
          {flavor ? (
            <div className={flavorClass} aria-live="polite">
              <Label>{flavor.text}</Label>
            </div>
          ) : null}
        </div>
        <div className="hud-bottom-right">
          <Mono className="hud-difficulty">Difficulty ×{difficultyMultiplier.toFixed(2)}</Mono>
          {fpsLabel && (
            <Mono className="hud-fps" aria-label="Frame rate">
              {fpsLabel}
            </Mono>
          )}
          <div className="hud-primary-row">
            <Mono className="hud-primary-metric" aria-label="Lives">
              {summaryLives}
            </Mono>
            <Mono className="hud-primary-metric" aria-label="Coins">
              {summaryCoins}
            </Mono>
          </div>
        </div>
      </section>
    </div>
  );
};
