import { useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { Button, Panel } from '@lucky-break/design-system';
import type { FateLedgerEntry, FateLedgerSnapshot } from 'app/fate-ledger';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useFateLedgerUi } from '../state/fate-ledger-bridge';

const MAX_DISPLAY_ENTRIES = 10;

const formatDuration = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

const trimTrailingZeros = (value: string): string =>
  value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

const formatSigned = (value: number, precision = 2): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = trimTrailingZeros(safe.toFixed(precision));
  if (safe > 0) {
    return `+${formatted}`;
  }
  if (safe < 0) {
    return formatted;
  }
  return '0';
};

const formatTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '—';
  }
  const iso = new Date(timestamp).toISOString();
  return iso.replace('T', ' ').slice(0, 16);
};

const formatEntry = (entry: FateLedgerEntry, index: number): string => {
  if (entry.kind !== 'idle-roll') {
    return '';
  }
  const timestamp = formatTimestamp(entry.timestamp);
  const duration = formatDuration(entry.durationMs);
  const entropy = formatSigned(entry.entropyEarned, 1);
  const dust = trimTrailingZeros(entry.certaintyDustEarned.toFixed(2));
  const note = entry.notes ? ` — ${entry.notes}` : '';
  return `${index.toString().padStart(2, '0')}. ${timestamp} · ${duration} · ΔEntropy ${entropy} · Dust ${dust}${note}`;
};

const buildSummary = (snapshot: FateLedgerSnapshot): readonly string[] => {
  const lines = [
    `Logged Rolls: ${snapshot.totalIdleRolls}`,
    `Accumulated Idle Time: ${formatDuration(snapshot.totals.durationMs)}`,
    `Entropy Earned: ${formatSigned(snapshot.totals.entropyEarned, 1)}`,
    `Certainty Dust: ${trimTrailingZeros(snapshot.totals.certaintyDustEarned.toFixed(2))}`,
  ];

  if (snapshot.latestEntryTimestamp) {
    lines.push(`Last Entry: ${formatTimestamp(snapshot.latestEntryTimestamp)}`);
  }

  return lines;
};

export const FateLedgerApp = (): JSX.Element | null => {
  const { theme } = useGameTheme();
  const { visible, suspended, snapshot, onClose } = useFateLedgerUi();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null && typeof onClose === 'function';

  useStagePointerBlocker(isActive, resolveDocument);

  const overlayStyle = useMemo(
    () =>
      ({
        '--ledger-bg-from': theme.background.from,
        '--ledger-bg-to': theme.background.to,
        '--ledger-panel-fill': theme.hud.panelFill,
        '--ledger-panel-line': theme.hud.panelLine,
        '--ledger-text-primary': theme.hud.textPrimary,
        '--ledger-text-secondary': theme.hud.textSecondary,
        '--ledger-highlight': theme.accents.combo,
      }) as CSSProperties,
    [theme],
  );

  const backdropStyle = useMemo(
    () =>
      ({
        background:
          'linear-gradient(160deg, rgba(18,12,30,0.82), rgba(12,8,24,0.74)), radial-gradient(circle at 24% 24%, rgba(114,178,255,0.18), transparent 54%), radial-gradient(circle at 78% 72%, rgba(255,166,146,0.16), transparent 56%)',
      }) as CSSProperties,
    [],
  );

  const surfaceStyle = useMemo(
    () =>
      ({
        background:
          'linear-gradient(160deg, rgba(26,18,46,0.94), rgba(18,10,32,0.84)), linear-gradient(320deg, rgba(124,104,255,0.16), rgba(255,146,156,0.12))',
        borderColor: 'rgba(255, 255, 255, 0.12)',
      }) as CSSProperties,
    [],
  );

  const summaryPanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(32,24,54,0.78), rgba(18,10,32,0.66))',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }) as CSSProperties,
    [],
  );

  const entriesPanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(28,18,44,0.78), rgba(16,10,30,0.68))',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }) as CSSProperties,
    [],
  );

  const summaryLines = useMemo(() => (snapshot ? buildSummary(snapshot) : []), [snapshot]);
  const entryLines = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const entries = snapshot.entries.slice(0, MAX_DISPLAY_ENTRIES);
    return entries
      .map((entry, index) => formatEntry(entry, index + 1))
      .filter((line) => line.length > 0);
  }, [snapshot]);

  if (!isActive || !snapshot || !onClose) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-[9] flex items-center justify-center px-4 py-8 sm:px-6"
      style={overlayStyle}
      ref={overlayRef}
      role="presentation"
      onClick={() => onClose()}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10" style={backdropStyle} />
      <div
        className="pointer-events-auto relative flex w-full max-w-[820px] flex-col gap-6 overflow-hidden rounded-[36px] border px-6 py-8 text-[color:var(--ledger-text-primary,#f5f0ff)] shadow-[0_44px_120px_rgba(4,3,16,0.65)] backdrop-blur-2xl sm:gap-8 sm:px-10 sm:py-12"
        style={surfaceStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fate-ledger-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="flex flex-col items-center gap-3 text-center">
          <h1
            id="fate-ledger-title"
            className="font-display text-[clamp(40px,6vw,70px)] uppercase tracking-[0.12em] text-[color:var(--ledger-highlight,#ffd45c)] drop-shadow-[0_18px_40px_rgba(0,0,0,0.58)]"
          >
            Fate Ledger
          </h1>
          <p className="text-[clamp(14px,1.8vmin,18px)] tracking-[0.04em] text-[color:var(--ledger-text-secondary,#d0c0ff)]">
            Chronicle of idle rolls and entropy dividends
          </p>
        </header>

        <Panel
          tone="muted"
          aria-label="Idle roll summary"
          className="ui-interactive flex flex-col gap-4 rounded-[28px] border px-6 py-6 sm:px-8 sm:py-8"
          style={summaryPanelStyle}
        >
          <ul className="flex flex-col gap-3 text-[clamp(13px,1.8vmin,16px)]">
            {summaryLines.map((line, index) => (
              <li
                key={`ledger-summary-${index}`}
                className="flex items-start gap-3 leading-relaxed"
              >
                <span className="text-lg leading-none text-[color:var(--ledger-highlight,#ffd45c)]">
                  ✦
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          tone="muted"
          aria-label="Recent entries"
          className="ui-interactive flex flex-col gap-4 rounded-[28px] border px-6 py-6 sm:px-8 sm:py-8"
          style={entriesPanelStyle}
        >
          {entryLines.length > 0 ? (
            <ul className="flex flex-col gap-3 font-mono text-[clamp(12px,1.5vmin,14px)] leading-relaxed tracking-[0.02em]">
              {entryLines.map((line, index) => (
                <li key={`ledger-entry-${index}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[color:var(--ledger-text-secondary,#d0c0ff)]">
              No idle rolls recorded yet. Complete idle simulations to chronicle your fate.
            </p>
          )}
        </Panel>

        <footer className="flex flex-wrap items-center justify-between gap-4 text-[clamp(12px,1.4vmin,14px)] text-[rgba(255,240,255,0.75)]">
          <span>Tap anywhere outside this panel to close</span>
          <Button
            variant="outline"
            size="sm"
            className="ui-interactive rounded-full border border-white/25 bg-transparent px-5 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ledger-text-primary,#f5f0ff)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
};
