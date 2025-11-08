import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Heading, Label, Mono, Progress } from '@lucky-break/design-system';

import { LivesDialHeart } from './components/LivesDialHeart';
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

const formatSpeedValue = (speed: number): string => {
  if (!Number.isFinite(speed) || speed <= 0) {
    return '0';
  }
  if (speed >= 100) {
    return `${Math.round(speed)}`;
  }
  if (speed >= 10) {
    return `${speed.toFixed(1)}`;
  }
  return `${speed.toFixed(2)}`;
};

const formatGravityValue = (gravity: number): string => {
  if (!Number.isFinite(gravity)) {
    return '0';
  }
  const magnitude = Math.abs(gravity);
  if (magnitude < 0.01) {
    return '0';
  }
  const formatted = magnitude >= 0.1 ? magnitude.toFixed(2) : magnitude.toFixed(3);
  return formatted.replace(/0+$/, '').replace(/\.$/, '');
};

const getGravityDirection = (gravity: number | undefined): 'up' | 'down' | null => {
  if (typeof gravity !== 'number' || !Number.isFinite(gravity)) {
    return null;
  }
  const magnitude = Math.abs(gravity);
  if (magnitude < 0.01) {
    return null;
  }
  return gravity < 0 ? 'up' : 'down';
};

export const HudApp = (): JSX.Element | null => {
  const { t } = useTranslation();
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
    physics,
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

  const speedValue = useMemo(() => {
    if (!physics) {
      return null;
    }
    return formatSpeedValue(physics.currentSpeed);
  }, [physics]);

  const gravityValue = useMemo(() => {
    if (!physics?.gravity) {
      return null;
    }
    return formatGravityValue(physics.gravity);
  }, [physics]);

  const gravityDirection = useMemo(() => getGravityDirection(physics?.gravity), [physics]);

  if (!visible || !scoreboard) {
    return null;
  }

  const summaryCoins = formatCoins(coins);
  const comboTimerLabel =
    Number.isFinite(comboTimer) && comboTimer > 0
      ? t('hud.comboTimer', { time: comboTimer.toFixed(1) })
      : t('hud.comboTimerClosed');

  const brickProgress = brickTotal > 0 ? 1 - brickRemaining / brickTotal : 0;

  return (
    <div className="hud-layout">
      {/* BRICK PROGRESS BAR - Top of screen */}
      <section className="hud-brick-bar-top" aria-label="Brick progress">
        <Progress
          value={brickProgress * 100}
          className="hud-bricks-bar-fullwidth"
          aria-label="Brick progress"
        />
      </section>

      {/* TOP BAR */}
      <section className="hud-top" aria-live="polite">
        <header className="hud-header">
          <Label className="hud-status-text">{scoreboard.statusText}</Label>
          {scoreboard.summaryLine && (
            <Label className="hud-summary">{scoreboard.summaryLine}</Label>
          )}
        </header>

        <div className="hud-primary-metrics">
          <Heading className="hud-score">{t('hud.score', { value: formatScore(score) })}</Heading>
          {combo > 0 && (
            <div className="hud-combo" style={comboPulseStyle}>
              <Mono className="hud-combo-value">{t('hud.combo', { value: combo })}</Mono>
              <Mono className="hud-combo-timer">{comboTimerLabel}</Mono>
            </div>
          )}
        </div>

        <section className="hud-bricks" aria-label="Brick count">
          <Mono className="hud-bricks-label">
            {t('hud.bricks', { remaining: brickRemaining, total: brickTotal > 0 ? brickTotal : 0 })}
          </Mono>
        </section>
      </section>

      {/* RIGHT RAIL - Speed and Gravity stats */}
      <aside className="hud-right-stats">
        {speedValue !== null && (
          <div className="hud-stat">
            <Label className="hud-stat-label">{t('hud.speedLabel')}</Label>
            <Heading className="hud-stat-value">{speedValue}</Heading>
            <Label className="hud-stat-unit">u/s</Label>
          </div>
        )}
        {gravityValue !== null && gravityDirection && (
          <div className="hud-stat">
            <Label className="hud-stat-label">{t('hud.gravityLabel')}</Label>
            <Heading className={`hud-stat-value hud-gravity-${gravityDirection}`}>
              {gravityDirection === 'up' ? '↑' : '↓'} {gravityValue}
            </Heading>
          </div>
        )}
      </aside>

      {/* BOTTOM BAR */}
      <section className="hud-bottom" aria-live="polite">
        <div className="hud-bottom-left">
          <LivesDialHeart value={lives} max={3} size={72} />
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
          <Mono className="hud-difficulty">
            {t('hud.difficulty', { value: difficultyMultiplier.toFixed(2) })}
          </Mono>
          {fpsLabel && (
            <Mono className="hud-fps" aria-label="Frame rate">
              {fpsLabel}
            </Mono>
          )}
          <Mono className="hud-primary-metric" aria-label="Coins">
            {summaryCoins}
          </Mono>
        </div>
      </section>
    </div>
  );
};
