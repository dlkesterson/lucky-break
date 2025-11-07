import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { FateLedgerEntry, FateLedgerSnapshot } from 'app/fate-ledger';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useFateLedgerUi } from '../state/fate-ledger-bridge';
import {
  FateLedgerView,
  type FateLedgerSummaryLine,
  type FateLedgerEntryLine,
} from './FateLedgerView';

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

const buildSummary = (
  snapshot: FateLedgerSnapshot,
  t: (key: string, options?: Record<string, unknown>) => string,
): readonly FateLedgerSummaryLine[] => {
  const lines: FateLedgerSummaryLine[] = [
    {
      key: 'logged-rolls',
      text: t('fateLedger.summary.loggedRolls', { count: snapshot.totalIdleRolls }),
    },
    {
      key: 'idle-time',
      text: t('fateLedger.summary.idleTime', {
        duration: formatDuration(snapshot.totals.durationMs),
      }),
    },
    {
      key: 'entropy-earned',
      text: t('fateLedger.summary.entropyEarned', {
        value: formatSigned(snapshot.totals.entropyEarned, 1),
      }),
    },
    {
      key: 'certainty-dust',
      text: t('fateLedger.summary.certaintyDust', {
        value: trimTrailingZeros(snapshot.totals.certaintyDustEarned.toFixed(2)),
      }),
    },
  ];

  if (snapshot.latestEntryTimestamp) {
    lines.push({
      key: 'last-entry',
      text: t('fateLedger.summary.lastEntry', {
        timestamp: formatTimestamp(snapshot.latestEntryTimestamp),
      }),
    });
  }

  return lines;
};

/**
 * FateLedgerApp - Container Component
 *
 * Handles:
 * - Game state integration (Zustand store)
 * - Theme provider integration
 * - Stage pointer blocking
 * - Data formatting for summary and entries
 *
 * Delegates presentation to FateLedgerView.
 */
export const FateLedgerApp = (): JSX.Element | null => {
  const { t } = useTranslation();
  const { theme } = useGameTheme();
  const { visible, suspended, snapshot, onClose } = useFateLedgerUi();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resolveDocument = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);

  const isActive = visible && !suspended && snapshot !== null && typeof onClose === 'function';

  useStagePointerBlocker(isActive, resolveDocument);

  const summaryLines = useMemo(() => (snapshot ? buildSummary(snapshot, t) : []), [snapshot, t]);
  const entryLines = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const entries = snapshot.entries.slice(0, MAX_DISPLAY_ENTRIES);
    return entries
      .map((entry, index) => ({
        key: `entry-${index}-${entry.timestamp}`,
        text: formatEntry(entry, index + 1),
      }))
      .filter((line) => line.text.length > 0);
  }, [snapshot]);

  if (!isActive || !snapshot || !onClose) {
    return null;
  }

  return (
    <FateLedgerView
      visible={visible}
      summaryLines={summaryLines}
      entryLines={entryLines}
      theme={theme}
      onClose={onClose}
      overlayRef={overlayRef}
    />
  );
};
