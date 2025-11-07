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
import {
  Button,
  Panel,
  Heading,
  Label,
  Mono,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@lucky-break/design-system';
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

  const isActive = visible && !suspended && snapshot !== null;
  const legendLines = snapshot?.legendLines ?? [];

  const resolveDialogContainer = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);
  useStagePointerBlocker(isActive, resolveDialogContainer);

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

  const scorePanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(30, 22, 52, 0.78), rgba(18, 12, 36, 0.66))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const storePanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(40, 28, 70, 0.72), rgba(18, 10, 32, 0.62))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const legendPanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(32, 24, 58, 0.68), rgba(20, 12, 36, 0.56))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
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

  const handleResume = async (
    event?: MouseEvent<HTMLDivElement | HTMLButtonElement>,
  ): Promise<void> => {
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

  const handleQuit = async (event?: MouseEvent<HTMLButtonElement>): Promise<void> => {
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
    <div ref={overlayRef} style={overlayStyle}>
      <Dialog open={isActive} onOpenChange={(open: boolean) => !open && handleResume()}>
        <DialogContent
          className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[32px] border border-white/10 bg-gradient-to-br from-[rgba(24,18,44,0.92)] to-[rgba(16,10,32,0.82)] px-6 py-8 text-[color:var(--pause-text-primary,#fdf8ff)] shadow-[0_36px_90px_rgba(4,3,16,0.6)] backdrop-blur-2xl sm:px-10 sm:py-10"
          overlayClassName="bg-[radial-gradient(circle_at_18%_22%,rgba(107,173,255,0.18),transparent_54%),radial-gradient(circle_at_82%_78%,rgba(255,186,120,0.18),transparent_52%),linear-gradient(160deg,rgba(14,10,36,0.88),rgba(10,6,24,0.76))]"
          onPointerDownOutside={(e: Event) => {
            e.preventDefault();
            void handleResume();
          }}
          onEscapeKeyDown={(e: KeyboardEvent) => {
            e.preventDefault();
            void handleResume();
          }}
        >
          <DialogHeader className="flex flex-col items-center gap-3 text-center">
            <DialogTitle className="text-[clamp(44px,6vw,72px)] uppercase tracking-[0.08em] text-[color:var(--pause-accent,#ffd45c)] drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
              {snapshot?.title ?? 'Paused'}
            </DialogTitle>
            <DialogDescription className="text-[clamp(15px,2vmin,20px)] tracking-[0.04em] text-[color:var(--pause-text-secondary,#cdb6ff)]">
              Run paused — the odds wait for no one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6 sm:gap-7">
            <Panel
              tone="muted"
              aria-label="Current score"
              className="flex flex-col items-center gap-2 rounded-[24px] text-center"
              style={scorePanelStyle}
            >
              <Mono className="text-xs uppercase tracking-[0.12em] text-white/70">Score</Mono>
              <span className="text-[clamp(32px,5.2vmin,54px)] font-extrabold">
                {formatScore(snapshot?.score ?? 0)}
              </span>
            </Panel>

            <Panel
              tone="muted"
              aria-label="Entropy store"
              className="flex flex-col gap-4 rounded-[24px]"
              style={storePanelStyle}
            >
              <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Heading className="text-[clamp(20px,2.6vmin,26px)] uppercase tracking-[0.04em] text-[color:var(--pause-text-secondary,#d0bcff)]">
                  Entropy Actions
                </Heading>
                <div className="flex flex-col items-end gap-1 font-mono text-xs uppercase tracking-[0.12em] text-white/70">
                  <Mono className="text-xs">Coins</Mono>
                  <Mono className="text-[color:var(--pause-accent,#ffd45c)] text-[clamp(18px,2.6vmin,22px)] font-bold">
                    {coinDisplay}
                  </Mono>
                </div>
              </header>

              {entropyActions.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {entropyActions.map((entry) => {
                    const available = isEntropyActionAvailable(entry);
                    const charged = entry.charges > 0;
                    const disabled = !available || !attemptEntropyAction;

                    const actionClass = cn(
                      'ui-interactive flex w-full flex-col items-start justify-start gap-1 rounded-2xl border border-white/15 bg-[rgba(12,8,24,0.42)] px-4 py-3 text-left text-[clamp(14px,1.9vmin,17px)] transition-all duration-150',
                      'hover:-translate-y-0.5 focus-visible:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60',
                      charged &&
                        'border-[rgba(255,213,110,0.65)] shadow-[0_0_22px_rgba(255,213,110,0.25)]',
                      !charged && available && 'border-[rgba(132,196,255,0.45)]',
                      !available && 'opacity-55',
                    );

                    return (
                      <li key={entry.action}>
                        <Button
                          className={actionClass}
                          disabled={disabled}
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (disabled || !attemptEntropyAction) {
                              return;
                            }
                            attemptEntropyAction(entry.action);
                          }}
                        >
                          <span className="font-semibold uppercase tracking-[0.08em]">
                            {entry.label}
                          </span>
                          <span className="text-sm text-[color:var(--pause-text-secondary,#cdb6ff)]">
                            {formatEntropyDetail(entry)}
                          </span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Label className="text-sm text-[color:var(--pause-text-secondary,#cdb6ff)]">
                  No entropy plays available — build combo and coins to unlock new options.
                </Label>
              )}

              <div className="flex flex-col gap-4">
                <Heading className="text-[clamp(18px,2.6vmin,22px)] uppercase tracking-[0.04em] text-[color:var(--pause-text-secondary,#d0bcff)]">
                  Audio
                </Heading>
                <label className="flex flex-col gap-2 text-sm text-white/75">
                  <Label className="text-sm">Master Volume {volumePercent}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumePercent}
                    onChange={handleVolumeChange}
                    disabled={!updateSettings}
                    className="accent-[color:var(--pause-accent,#ffd45c)]"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={settings.muted}
                    onChange={handleMuteToggle}
                    disabled={!updateSettings}
                    className="accent-[color:var(--pause-accent,#ffd45c)]"
                  />
                  <Label className="text-sm">Mute audio</Label>
                </label>
              </div>
            </Panel>

            <Panel
              tone="muted"
              aria-label="Power-up legend"
              className="flex flex-col gap-4 rounded-[24px] text-left"
              style={legendPanelStyle}
            >
              {snapshot?.legendTitle ? (
                <Heading className="text-[clamp(18px,2.6vmin,24px)] uppercase tracking-[0.04em] text-[color:var(--pause-text-secondary,#d0bcff)]">
                  {snapshot.legendTitle}
                </Heading>
              ) : null}
              {legendLines.length > 0 ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-[color:var(--pause-text-primary,#fdf8ff)]">
                  {legendLines.map((line, index) => (
                    <li key={`legend-line-${index}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <Label className="text-sm text-[color:var(--pause-text-secondary,#d0bcff)]">
                  No legend entries yet — experiment to reveal mysteries.
                </Label>
              )}
            </Panel>

            <footer className="flex flex-col items-center gap-6">
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  className="ui-interactive min-w-[200px] rounded-full border-2 border-[color:var(--pause-accent,#ffd45c)] bg-gradient-to-br from-[rgba(255,214,110,0.95)] to-[rgba(255,166,88,0.92)] text-base font-bold uppercase tracking-[0.06em] text-stone-900 shadow-[0_18px_36px_rgba(255,188,96,0.35)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleResume();
                  }}
                  disabled={pendingAction !== null}
                  size="lg"
                >
                  {pendingAction === 'resume' ? 'Resuming…' : (snapshot?.resumeLabel ?? 'Resume')}
                </Button>
                {snapshot?.onQuit && snapshot.quitLabel ? (
                  <Button
                    className="ui-interactive min-w-[200px] rounded-full border border-white/40 bg-transparent font-semibold uppercase tracking-[0.06em] text-[color:var(--pause-text-secondary,#d0bcff)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
                    onClick={handleQuit}
                    disabled={pendingAction !== null}
                    variant="outline"
                    size="lg"
                  >
                    {pendingAction === 'quit' ? 'Quitting…' : snapshot.quitLabel}
                  </Button>
                ) : null}
              </div>
              <Button
                className="text-xs uppercase tracking-[0.1em] text-[color:var(--pause-text-secondary,#d0bcff)] opacity-80 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
                variant="link"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTheme();
                }}
              >
                {themeLabel} · Shift+C
              </Button>
            </footer>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
