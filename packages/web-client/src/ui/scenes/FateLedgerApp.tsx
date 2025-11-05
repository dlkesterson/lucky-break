import { useCallback, useMemo, useRef, type CSSProperties } from 'react';
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
      className="fate-ledger-overlay"
      style={overlayStyle}
      ref={overlayRef}
      onClick={() => onClose()}
    >
      <div className="fate-ledger-backdrop" />
      <div
        className="fate-ledger-surface ui-interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fate-ledger-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="fate-ledger-header">
          <h1 id="fate-ledger-title">Fate Ledger</h1>
          <p>Chronicle of idle rolls and entropy dividends</p>
        </header>

        <section className="fate-ledger-summary" aria-label="Idle roll summary">
          <ul>
            {summaryLines.map((line, index) => (
              <li key={`ledger-summary-${index}`}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="fate-ledger-entries" aria-label="Recent entries">
          {entryLines.length > 0 ? (
            <ul>
              {entryLines.map((line, index) => (
                <li key={`ledger-entry-${index}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>No idle rolls recorded yet. Complete idle simulations to chronicle your fate.</p>
          )}
        </section>

        <footer className="fate-ledger-footer">
          <span>Tap anywhere outside this panel to close</span>
          <button
            type="button"
            className="fate-ledger-close"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
