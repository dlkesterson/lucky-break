import type { CSSProperties, ChangeEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { GameThemeDefinition } from 'render/theme';
import type { HudEntropyActionDescriptor } from 'render/hud';
import type { PowerUpType } from 'util/power-ups';

export interface LegendItem {
  readonly type?: PowerUpType;
  readonly text: string;
}

export interface PauseViewProps {
  readonly visible: boolean;
  readonly title: string;
  readonly description: string;
  readonly score: number;
  readonly coins: number;
  readonly entropyActions: readonly HudEntropyActionDescriptor[];
  readonly legendTitle: string | null;
  readonly legendItems: readonly LegendItem[];
  readonly resumeLabel: string;
  readonly quitLabel: string | null;
  readonly pending: 'resume' | 'quit' | null;
  readonly theme: GameThemeDefinition;
  readonly themeLabel: string;
  readonly volumePercent: number;
  readonly muted: boolean;
  readonly overlayStyle: CSSProperties;
  readonly scorePanelStyle: CSSProperties;
  readonly storePanelStyle: CSSProperties;
  readonly legendPanelStyle: CSSProperties;
  readonly onResume: (event?: MouseEvent<HTMLDivElement | HTMLButtonElement>) => Promise<void>;
  readonly onQuit: ((event?: MouseEvent<HTMLButtonElement>) => Promise<void>) | null;
  readonly onVolumeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onMuteToggle: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onThemeToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onEntropyAction: (action: string) => void;
  readonly overlayRef?: React.RefObject<HTMLDivElement>;
}

export const formatScore = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return value.toLocaleString();
};

export const formatCoins = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0c';
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}c`;
};

export const formatEntropyDetail = (
  descriptor: HudEntropyActionDescriptor,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const cost = Math.max(0, Math.round(descriptor.cost));
  const status =
    descriptor.charges > 0
      ? t('pause.entropyStore.statusCharges', { count: descriptor.charges })
      : descriptor.affordable
        ? t('pause.entropyStore.statusReady')
        : t('pause.entropyStore.statusLocked');
  return `${descriptor.hotkey.toUpperCase()} · ${t('pause.entropyStore.costLabel', { cost })} · ${status}`;
};

export const isEntropyActionAvailable = (descriptor: HudEntropyActionDescriptor): boolean =>
  descriptor.charges > 0 || descriptor.affordable;

const PowerUpIcon = ({ type, size = 24 }: { type: PowerUpType; size?: number }): JSX.Element => {
  const colors = {
    'paddle-width': { bg: '#ffd700', icon: '#b8860b' },
    'ball-speed': { bg: '#00d4ff', icon: '#ffff00' },
    'multi-ball': { bg: '#9c27b0', icon: '#e91e63' },
    'sticky-paddle': { bg: '#14b8a6', icon: '#ffffff' },
    laser: { bg: '#ff1744', icon: '#ff8a80' },
  };

  const color = colors[type] || { bg: '#ffffff', icon: '#000000' };

  return (
    <div
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color.bg,
        borderColor: color.icon,
        boxShadow: `0 0 8px ${color.bg}40`,
      }}
      aria-hidden="true"
    >
      {type === 'paddle-width' && (
        <span className="font-bold" style={{ color: color.icon, fontSize: `${size * 0.5}px` }}>
          $
        </span>
      )}
      {type === 'ball-speed' && (
        <span className="font-bold" style={{ color: color.icon, fontSize: `${size * 0.6}px` }}>
          ⚡
        </span>
      )}
      {type === 'multi-ball' && (
        <span className="font-bold" style={{ color: color.icon, fontSize: `${size * 0.5}px` }}>
          ∞
        </span>
      )}
      {type === 'sticky-paddle' && (
        <span className="font-bold" style={{ color: color.icon, fontSize: `${size * 0.5}px` }}>
          ●
        </span>
      )}
      {type === 'laser' && (
        <span className="font-bold" style={{ color: color.icon, fontSize: `${size * 0.6}px` }}>
          ◆
        </span>
      )}
    </div>
  );
};

export const PauseView = ({
  visible,
  title,
  description,
  score,
  coins,
  entropyActions,
  legendTitle,
  legendItems,
  resumeLabel,
  quitLabel,
  pending,
  theme,
  themeLabel,
  volumePercent,
  muted,
  overlayStyle,
  scorePanelStyle,
  storePanelStyle,
  legendPanelStyle,
  onResume,
  onQuit,
  onVolumeChange,
  onMuteToggle,
  onThemeToggle,
  onEntropyAction,
  overlayRef,
}: PauseViewProps): JSX.Element | null => {
  const { t } = useTranslation();

  if (!visible) {
    return null;
  }

  const coinDisplay = formatCoins(coins);

  return (
    <div ref={overlayRef} style={overlayStyle}>
      <Dialog open={visible}>
        <DialogContent
          className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[24px] border border-white/10 bg-gradient-to-br px-4 py-6 shadow-[0_36px_90px_rgba(4,3,16,0.6)] backdrop-blur-2xl sm:rounded-[32px] sm:px-6 sm:py-8 md:px-10 md:py-10"
          style={{
            background: `linear-gradient(150deg, ${theme.background.from}eb, ${theme.background.to}d1)`,
            color: theme.hud.textPrimary,
          }}
          overlayClassName="bg-[radial-gradient(circle_at_18%_22%,rgba(107,173,255,0.18),transparent_54%),radial-gradient(circle_at_82%_78%,rgba(255,186,120,0.18),transparent_52%),linear-gradient(160deg,rgba(14,10,36,0.88),rgba(10,6,24,0.76))]"
          onPointerDownOutside={(e: Event) => {
            e.preventDefault();
            void onResume();
          }}
          onEscapeKeyDown={(e: KeyboardEvent) => {
            e.preventDefault();
            void onResume();
          }}
        >
          <DialogHeader className="flex flex-col items-center gap-2 text-center sm:gap-3">
            <DialogTitle
              className="text-[clamp(38px,7vw,72px)] uppercase leading-tight tracking-[0.08em] drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
              style={{ color: theme.accents.combo }}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className="text-[clamp(14px,2.2vmin,20px)] tracking-[0.04em]"
              style={{ color: theme.hud.textSecondary }}
            >
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 sm:gap-6 md:gap-7">
            <Panel
              tone="muted"
              aria-label="Current score"
              className="flex flex-col items-center gap-1.5 rounded-[20px] text-center sm:gap-2 sm:rounded-[24px]"
              style={scorePanelStyle}
            >
              <Mono className="text-[10px] uppercase tracking-[0.12em] text-white/70 sm:text-xs">
                {t('pause.scoreLabel')}
              </Mono>
              <span className="text-[clamp(28px,6vmin,54px)] font-extrabold">
                {formatScore(score)}
              </span>
            </Panel>

            <Panel
              tone="muted"
              aria-label="Entropy store"
              className="flex flex-col gap-3 rounded-[20px] sm:gap-4 sm:rounded-[24px]"
              style={storePanelStyle}
            >
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <Heading
                  className="text-[clamp(18px,3vmin,26px)] uppercase tracking-[0.04em]"
                  style={{ color: theme.hud.textSecondary }}
                >
                  {t('pause.entropyStore.title')}
                </Heading>
                <div className="flex flex-col items-start gap-0.5 font-mono text-xs uppercase tracking-[0.12em] text-white/70 sm:items-end sm:gap-1">
                  <Mono className="text-[10px] sm:text-xs">
                    {t('pause.entropyStore.coinsLabel')}
                  </Mono>
                  <Mono
                    className="text-[clamp(16px,3vmin,22px)] font-bold"
                    style={{ color: theme.accents.combo }}
                  >
                    {coinDisplay}
                  </Mono>
                </div>
              </header>

              {entropyActions.length > 0 ? (
                <ul className="flex flex-col gap-2.5 sm:gap-3">
                  {entropyActions.map((entry) => {
                    const available = isEntropyActionAvailable(entry);
                    const charged = entry.charges > 0;
                    const disabled = !available || pending !== null;

                    const actionClass = cn(
                      'ui-interactive flex w-full flex-col items-start justify-start gap-0.5 rounded-2xl border border-white/15 bg-[rgba(12,8,24,0.42)] px-3 py-2.5 text-left text-[clamp(13px,2.1vmin,17px)] transition-all duration-150 sm:gap-1 sm:px-4 sm:py-3',
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
                            if (disabled) {
                              return;
                            }
                            onEntropyAction(entry.action);
                          }}
                        >
                          <span className="text-sm font-semibold uppercase tracking-[0.08em] sm:text-base">
                            {entry.label}
                          </span>
                          <span
                            className="text-xs sm:text-sm"
                            style={{ color: theme.hud.textSecondary }}
                          >
                            {formatEntropyDetail(entry, t)}
                          </span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Label
                  className="text-[clamp(13px,1.9vmin,14px)]"
                  style={{ color: theme.hud.textSecondary }}
                >
                  {t('pause.entropyStore.emptyState')}
                </Label>
              )}

              <div className="flex flex-col gap-3 sm:gap-4">
                <Heading
                  className="text-[clamp(17px,3vmin,22px)] uppercase tracking-[0.04em]"
                  style={{ color: theme.hud.textSecondary }}
                >
                  {t('pause.audio.title')}
                </Heading>
                <label className="flex flex-col gap-1.5 text-sm text-white/75 sm:gap-2">
                  <Label className="text-[clamp(13px,1.9vmin,14px)]">
                    {t('pause.audio.volumeLabel', { percent: volumePercent })}
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumePercent}
                    onChange={onVolumeChange}
                    style={{ accentColor: theme.accents.combo }}
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={muted}
                    onChange={onMuteToggle}
                    style={{ accentColor: theme.accents.combo }}
                  />
                  <Label className="text-[clamp(13px,1.9vmin,14px)]">
                    {t('pause.audio.muteLabel')}
                  </Label>
                </label>
              </div>
            </Panel>

            <Panel
              tone="muted"
              aria-label="Power-up legend"
              className="flex flex-col gap-3 rounded-[20px] text-left sm:gap-4 sm:rounded-[24px]"
              style={legendPanelStyle}
            >
              {legendTitle ? (
                <Heading
                  className="text-[clamp(17px,3vmin,24px)] uppercase tracking-[0.04em]"
                  style={{ color: theme.hud.textSecondary }}
                >
                  {legendTitle}
                </Heading>
              ) : null}
              {legendItems.length > 0 ? (
                <ul className="flex flex-col gap-2.5 sm:gap-3">
                  {legendItems.map((item, index) => (
                    <li
                      key={`legend-item-${index}`}
                      className="flex items-start gap-2.5 text-[clamp(13px,1.9vmin,14px)] sm:gap-3"
                      style={{ color: theme.hud.textPrimary }}
                    >
                      {item.type && <PowerUpIcon type={item.type} size={28} />}
                      <span className="flex-1 pt-0.5">{item.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Label
                  className="text-[clamp(13px,1.9vmin,14px)]"
                  style={{ color: theme.hud.textSecondary }}
                >
                  {t('pause.legend.emptyState')}
                </Label>
              )}
            </Panel>

            <footer className="flex flex-col items-center gap-4 sm:gap-6">
              <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
                <Button
                  className="ui-interactive min-w-[180px] rounded-full border-2 px-6 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-stone-900 shadow-[0_18px_36px_rgba(255,188,96,0.35)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 sm:min-w-[200px] sm:px-8 sm:py-3 sm:text-base"
                  style={{
                    borderColor: theme.accents.combo,
                    background: `linear-gradient(to bottom right, ${theme.accents.combo}f2, ${theme.hud.accent}eb)`,
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    void onResume();
                  }}
                  disabled={pending !== null}
                  size="lg"
                >
                  {resumeLabel}
                </Button>
                {onQuit && quitLabel ? (
                  <Button
                    className="ui-interactive min-w-[180px] rounded-full border bg-transparent px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 sm:min-w-[200px] sm:px-8 sm:py-3 sm:text-base"
                    style={{
                      borderColor: 'rgba(255, 255, 255, 0.4)',
                      color: theme.hud.textSecondary,
                    }}
                    onClick={onQuit}
                    disabled={pending !== null}
                    variant="outline"
                    size="lg"
                  >
                    {quitLabel}
                  </Button>
                ) : null}
              </div>
              <Button
                className="text-[10px] uppercase tracking-[0.1em] opacity-80 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 sm:text-xs"
                style={{ color: theme.hud.textSecondary }}
                variant="link"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onThemeToggle(event);
                }}
              >
                {themeLabel}
              </Button>
            </footer>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
