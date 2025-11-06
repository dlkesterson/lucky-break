import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { toggleTheme, getThemeLabel } from 'render/theme';
import type { HudEntropyActionDescriptor } from 'render/hud';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useHud } from '../state/game-bridge';
import { usePauseUi } from '../state/pause-bridge';

const formatScore = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return value.toLocaleString();
};

const formatCoins = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0c';
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}c`;
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

export const PauseApp = (): JSX.Element | null => {
  const { theme, name: themeName } = useGameTheme();
  const { visible, suspended, snapshot } = usePauseUi();
  const { coins, entropyActions, attemptEntropyAction, settings, updateSettings } = useHud();
  const [pendingAction, setPendingAction] = useState<'resume' | 'quit' | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null;
  const legendLines = snapshot?.legendLines ?? [];

  useStagePointerBlocker(isActive, resolveDocument);

  useEffect(() => {
    if (!visible || suspended) {
      setPendingAction(null);
    }
  }, [visible, suspended, snapshot]);

  const overlayStyle = useMemo(
    () =>
      ({
        '--pause-bg-from': theme.background.from,
        '--pause-bg-to': theme.background.to,
        '--pause-panel-fill': theme.hud.panelFill,
        '--pause-panel-line': theme.hud.panelLine,
        '--pause-text-primary': theme.hud.textPrimary,
        '--pause-text-secondary': theme.hud.textSecondary,
        '--pause-accent': theme.accents.combo,
      }) as CSSProperties,
    [theme],
  );

  const themeLabel = useMemo(() => `Color Mode: ${getThemeLabel(themeName)}`, [themeName]);

  const resetPendingIfVisible = () => {
    if (!visible) {
      setPendingAction(null);
    }
  };

  const coinDisplay = useMemo(() => formatCoins(coins), [coins]);

  const volumePercent = useMemo(() => {
    if (!Number.isFinite(settings.masterVolume)) {
      return 0;
    }
    const clamped = Math.max(0, Math.min(1, settings.masterVolume));
    return Math.round(clamped * 100);
  }, [settings.masterVolume]);

  const handleVolumeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      const nextValue = Number(event.currentTarget.value);
      if (!Number.isFinite(nextValue) || !updateSettings) {
        return;
      }
      const normalized = Math.max(0, Math.min(100, nextValue)) / 100;
      updateSettings({
        masterVolume: normalized,
        ...(normalized > 0 && settings.muted ? { muted: false } : {}),
      });
    },
    [settings.muted, updateSettings],
  );

  const handleMuteToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (!updateSettings) {
        return;
      }
      updateSettings({ muted: event.currentTarget.checked });
    },
    [updateSettings],
  );

  if (!isActive || !snapshot) {
    return null;
  }

  const handleResume = async (event?: MouseEvent) => {
    event?.stopPropagation();
    if (pendingAction) {
      return;
    }
    try {
      setPendingAction('resume');
      await snapshot.onResume();
    } catch (error) {
      console.error('Failed to resume from pause overlay', error);
      setPendingAction(null);
      resetPendingIfVisible();
    }
  };

  const handleQuit = async (event?: MouseEvent) => {
    event?.stopPropagation();
    if (!snapshot.onQuit || pendingAction) {
      return;
    }
    try {
      setPendingAction('quit');
      await snapshot.onQuit();
    } catch (error) {
      console.error('Failed to quit from pause overlay', error);
      setPendingAction(null);
      resetPendingIfVisible();
    }
  };

  return (
    <div className="pause-overlay" style={overlayStyle} ref={overlayRef}>
      <div className="pause-backdrop" />
      <div
        className="pause-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        onClick={(event) => {
          void handleResume(event);
        }}
      >
        <header className="pause-header">
          <h1 id="pause-title">{snapshot.title}</h1>
          <p>Run paused — the odds wait for no one.</p>
        </header>

        <section className="pause-score" aria-label="Current score">
          <span className="pause-score-label">Score</span>
          <span className="pause-score-value">{formatScore(snapshot.score)}</span>
        </section>

        <section
          className="pause-store ui-interactive"
          aria-label="Entropy store"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <header className="pause-store-header">
            <h2>Entropy Actions</h2>
            <div className="pause-store-coins" aria-label="Coin balance">
              <span>Coins</span>
              <strong>{coinDisplay}</strong>
            </div>
          </header>
          {entropyActions.length > 0 ? (
            <ul className="pause-store-actions">
              {entropyActions.map((entry) => {
                const available = isEntropyActionAvailable(entry);
                const variantClass =
                  entry.charges > 0
                    ? ' pause-store-action--charged'
                    : available
                      ? ' pause-store-action--ready'
                      : ' pause-store-action--locked';
                const disabled = !available || !attemptEntropyAction;
                return (
                  <li key={entry.action}>
                    <button
                      type="button"
                      className={`pause-store-action ui-interactive${variantClass}`}
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (disabled || !attemptEntropyAction) {
                          return;
                        }
                        attemptEntropyAction(entry.action);
                      }}
                    >
                      <span className="pause-store-action-label">{entry.label}</span>
                      <span className="pause-store-action-detail">
                        {formatEntropyDetail(entry)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pause-store-empty">
              No entropy plays available — build combo and coins to unlock new options.
            </p>
          )}

          <div className="pause-store-audio" aria-label="Audio controls">
            <h3>Audio</h3>
            <label className="pause-audio-volume">
              <span>Master Volume {volumePercent}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={handleVolumeChange}
                disabled={!updateSettings}
              />
            </label>
            <label className="pause-audio-toggle">
              <input
                type="checkbox"
                checked={settings.muted}
                onChange={handleMuteToggle}
                disabled={!updateSettings}
              />
              Mute audio
            </label>
          </div>
        </section>

        <section className="pause-legend" aria-label="Power-up legend">
          {snapshot.legendTitle && <h2>{snapshot.legendTitle}</h2>}
          {legendLines.length > 0 ? (
            <ul>
              {legendLines.map((line, index) => (
                <li key={`legend-line-${index}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="pause-legend-empty">
              No legend entries yet — experiment to reveal mysteries.
            </p>
          )}
        </section>

        <footer className="pause-footer">
          <div className="pause-actions">
            <button
              type="button"
              className="pause-button pause-button--primary"
              onClick={handleResume}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'resume' ? 'Resuming…' : snapshot.resumeLabel}
            </button>
            {snapshot.onQuit && snapshot.quitLabel && (
              <button
                type="button"
                className="pause-button pause-button--secondary"
                onClick={handleQuit}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'quit' ? 'Quitting…' : snapshot.quitLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            className="pause-theme-toggle"
            onClick={(event) => {
              event.stopPropagation();
              toggleTheme();
            }}
          >
            {themeLabel} · Shift+C
          </button>
        </footer>
      </div>
    </div>
  );
};
