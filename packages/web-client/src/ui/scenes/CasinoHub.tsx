import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Panel, cn } from '@lucky-break/design-system';
import type {
  BiasPhaseSceneOption,
  BiasPhaseSessionSummary,
  NebulaSlotsSpinResult,
} from 'scenes/bias-phase';
import { NEBULA_SLOT_SYMBOLS, type NebulaSlotSymbol } from 'app/runtime/casino-games';
import { useBiasPhaseUi } from '../state/bias-phase-bridge';
import { useGameTheme } from '../hooks/useGameTheme';

const riskLabel: Record<BiasPhaseSceneOption['risk'], string> = {
  tilt: 'Tilt',
  lock: 'Lock',
  reforge: 'Reforge',
};

const trimTrailingZeros = (value: string): string =>
  value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

const formatNumber = (value: number): string => value.toLocaleString();

const formatSignedDelta = (value: number, decimals = 2): string => {
  if (!Number.isFinite(value)) {
    return '+/-0';
  }
  const threshold = 10 ** -decimals;
  if (Math.abs(value) < threshold) {
    return '+/-0';
  }
  const formatted = trimTrailingZeros(Math.abs(value).toFixed(decimals));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

const formatGravityBias = (session: BiasPhaseSessionSummary): string => {
  const value = trimTrailingZeros(session.gravity.toFixed(2));
  const delta = formatSignedDelta(session.gravityDelta, 2);
  return `${value}g (${delta})`;
};

const formatSpeedBias = (session: BiasPhaseSessionSummary): string => {
  const value = trimTrailingZeros(session.speedGovernor.toFixed(2));
  const delta = formatSignedDelta(session.speedDelta, 2);
  return `${value}x (${delta})`;
};

const slotSymbols = [...NEBULA_SLOT_SYMBOLS];

const SLOT_SYMBOL_EMOJI: Record<NebulaSlotSymbol, string> = {
  STAR: '⭐️',
  '777': '7️⃣',
  TILT: '🎯',
  LOCK: '🔒',
  LUCK: '🍀',
  VOID: '🪐',
  GLIM: '✨',
};

const REEL_COUNT = 3;
const REEL_ITEM_HEIGHT = 68;
const REEL_VISIBLE_COUNT = 3;
const REEL_VISIBLE_CENTER_OFFSET = Math.floor(REEL_VISIBLE_COUNT / 2);
const REEL_WINDOW_HEIGHT = REEL_ITEM_HEIGHT * REEL_VISIBLE_COUNT;
const REEL_REPEAT_COUNT = 12;
const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

const EXTENDED_REEL_SYMBOLS: readonly NebulaSlotSymbol[] = Array.from(
  { length: slotSymbols.length * REEL_REPEAT_COUNT + REEL_VISIBLE_COUNT },
  (_, index) => slotSymbols[index % slotSymbols.length],
);

const EXTENDED_REEL_LENGTH = EXTENDED_REEL_SYMBOLS.length;

const SYMBOL_INDEX_LOOKUP: Record<NebulaSlotSymbol, readonly number[]> = slotSymbols.reduce(
  (lookup, symbol) => {
    const indices: number[] = [];
    EXTENDED_REEL_SYMBOLS.forEach((value, index) => {
      if (value === symbol) {
        indices.push(index);
      }
    });
    lookup[symbol] = indices;
    return lookup;
  },
  {} as Record<NebulaSlotSymbol, readonly number[]>,
);

const modulo = (value: number, modulus: number): number => {
  if (modulus === 0) {
    return 0;
  }
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
};

const getReelSymbolAt = (position: number, offset = 0): NebulaSlotSymbol => {
  const index = modulo(position + offset, EXTENDED_REEL_LENGTH);
  return EXTENDED_REEL_SYMBOLS[index];
};

const BASE_LOOP_OFFSET = slotSymbols.length * Math.floor(REEL_REPEAT_COUNT / 2);
const SPIN_INTERVALS_MS: readonly number[] = [52, 60, 72];
const CELEBRATION_FLASH_DURATION_MS = 2600;
const DEFAULT_ERROR_MESSAGE = 'Nebula slots jammed. Try again shortly.';
const ENTROPY_SPEND_TOLERANCE = 1e-3;

const resolveSlotsErrorMessage = (caught: unknown): string => {
  if (typeof caught === 'string' && caught.length > 0) {
    return caught;
  }
  if (caught instanceof Error) {
    return caught.message || DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
};

const createDeterministicPicker = (seed: number) => {
  let state = seed >>> 0;
  if (state === 0) {
    state = 1;
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
};

const generatePreviewSymbols = (
  seed: number | null,
  entropy: number,
  offset: number,
): readonly NebulaSlotSymbol[] => {
  const normalizedSeed = (seed ?? 1) >>> 0 || 1;
  const normalizedEntropy = Math.max(0, Math.floor(entropy));
  return Array.from({ length: REEL_COUNT }, (_, reelIndex) => {
    const picker = createDeterministicPicker(
      normalizedSeed + (reelIndex + 1) * 1039 + normalizedEntropy * 73 + offset * 199,
    );
    const raw = picker();
    const symbolIndex = Math.floor(raw * slotSymbols.length) % slotSymbols.length;
    return slotSymbols[symbolIndex];
  });
};

const symbolsToPositions = (symbols: readonly NebulaSlotSymbol[]): number[] =>
  symbols.map((symbol) => {
    const symbolIndex = slotSymbols.indexOf(symbol);
    const resolvedIndex = symbolIndex >= 0 ? symbolIndex : 0;
    return BASE_LOOP_OFFSET + resolvedIndex - REEL_VISIBLE_CENTER_OFFSET;
  });

const computeTargetIndex = (currentTop: number, symbol: NebulaSlotSymbol): number => {
  const indices = SYMBOL_INDEX_LOOKUP[symbol] ?? SYMBOL_INDEX_LOOKUP[slotSymbols[0]];
  const cycleLength = EXTENDED_REEL_LENGTH;
  const normalizedCurrent = modulo(currentTop - BASE_LOOP_OFFSET, cycleLength);
  const cycleBase = currentTop - normalizedCurrent;

  for (const loopOffset of [0, cycleLength]) {
    for (const index of indices) {
      const candidateTop = cycleBase + loopOffset + index - REEL_VISIBLE_CENTER_OFFSET;
      if (candidateTop >= currentTop) {
        return candidateTop;
      }
    }
  }

  const fallbackIndex = indices[0] ?? 0;
  return cycleBase + cycleLength + fallbackIndex - REEL_VISIBLE_CENTER_OFFSET;
};

const getSymbolEmoji = (symbol: NebulaSlotSymbol): string => SLOT_SYMBOL_EMOJI[symbol] ?? '✨';

interface SlotSymbolCardProps {
  readonly symbol: NebulaSlotSymbol;
  readonly accentColor: string;
  readonly compact?: boolean;
}

const SlotSymbolCard = ({ symbol, accentColor, compact = false }: SlotSymbolCardProps) => {
  const emoji = getSymbolEmoji(symbol);
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-[18px] border border-white/14 bg-[rgba(22,10,32,0.9)] text-[color:var(--casino-text-primary,#fbeedd)] shadow-[inset_0_0_20px_rgba(0,0,0,0.45)]',
        compact ? 'h-20 text-3xl' : 'h-24 text-4xl',
      )}
      aria-label={`${symbol} symbol`}
    >
      <span className="leading-none">{emoji}</span>
      <span
        className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: accentColor }}
      >
        {symbol}
      </span>
      <div className="pointer-events-auto absolute inset-x-2 top-1 h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0 rounded-[18px]"
        style={{ boxShadow: '0 0 24px rgba(255, 214, 110, 0.18)' }}
      />
    </div>
  );
};

interface SlotReelProps {
  readonly position: number;
  readonly accentColor: string;
  readonly spinning: boolean;
  readonly highlight: boolean;
  readonly reelIndex: number;
}

const SlotReel = ({
  position,
  accentColor,
  spinning,
  highlight,
  reelIndex: _reelIndex,
}: SlotReelProps) => {
  // Render two full cycles so extended forward motion never exposes a gap.
  const doubledTrack = useMemo(
    () => [...EXTENDED_REEL_SYMBOLS, ...EXTENDED_REEL_SYMBOLS] as readonly NebulaSlotSymbol[],
    [],
  );
  const centerHighlightIndex = modulo(position + REEL_VISIBLE_CENTER_OFFSET, EXTENDED_REEL_LENGTH);
  const translateY = -(position * REEL_ITEM_HEIGHT);

  // While spinning we use linear (feels like a motor).
  // When stopping, we switch to a gentle ease-out.
  const transitionDuration = spinning ? '90ms' : '720ms';
  const transitionTiming = spinning ? 'linear' : 'cubic-bezier(0.18, 0.9, 0.16, 1)';

  return (
    <div
      className={cn(
        'relative flex w-24 justify-center overflow-hidden rounded-[20px] border border-white/14 bg-[rgba(18,10,30,0.92)] shadow-[inset_0_0_26px_rgba(0,0,0,0.48)] transition-all duration-300',
        highlight
          ? 'border-[rgba(255,214,110,0.65)] shadow-[0_0_36px_rgba(255,214,110,0.45)]'
          : undefined,
      )}
      style={{ height: `${REEL_WINDOW_HEIGHT}px` }}
      role="presentation"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(0deg, rgba(12,6,20,0.92) 0%, rgba(12,6,20,0.62) 10%, transparent 38%, transparent 62%, rgba(12,6,20,0.62) 90%, rgba(12,6,20,0.92) 100%)',
        }}
      />
      <div
        className="flex w-full flex-col items-center will-change-transform"
        style={{
          transform: `translateY(${translateY}px)`,
          transitionProperty: 'transform',
          transitionDuration,
          transitionTimingFunction: transitionTiming,
        }}
      >
        {doubledTrack.map((symbol, index) => {
          const showHighlight = highlight && index % EXTENDED_REEL_LENGTH === centerHighlightIndex;
          return (
            <div
              key={`nebula-reel-symbol-${index}`}
              className={cn(
                'flex h-[68px] w-full flex-col items-center justify-center text-4xl font-semibold leading-none text-white/85',
                showHighlight ? 'scale-110 text-white' : undefined,
              )}
              aria-hidden="true"
            >
              <span>{getSymbolEmoji(symbol)}</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {symbol}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-x-3 top-3 h-[2px] rounded-full"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}, transparent)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.5), transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[20px]"
        style={{
          boxShadow: highlight
            ? '0 0 42px rgba(255, 214, 110, 0.5)'
            : '0 0 24px rgba(0, 0, 0, 0.3)',
        }}
      />
    </div>
  );
};

const SlotsPreview = ({
  entropy,
  seed,
  accentColor,
}: {
  readonly entropy: number;
  readonly seed: number | null;
  readonly accentColor: string;
}) => {
  const [tick, setTick] = useState(0);
  const symbols = useMemo(() => generatePreviewSymbols(seed, entropy, tick), [entropy, seed, tick]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((value) => (value + 1) % 6);
    }, 3800);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/14 bg-[rgba(16,8,28,0.72)] shadow-[0_14px_32px_rgba(0,0,0,0.32)]">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="grid grid-cols-3 gap-1 p-4">
        {symbols.map((symbol, index) => (
          <SlotSymbolCard
            key={`slot-preview-${index}`}
            symbol={symbol}
            accentColor={accentColor}
            compact
          />
        ))}
      </div>
      <div className="px-4 pb-4 text-center text-[clamp(12px,1.6vmin,14px)] text-white/70">
        Nebula slots rehearse every volley. Spend entropy soon to divine the next bias surge.
      </div>
    </div>
  );
};

const NebulaSlotsGame = ({
  entropy,
  seed,
  accentColor,
  spinCost,
  disabled,
  onSpin,
  onResult,
  onForceAdvance,
  forceAdvanceLabel,
  forceAdvanceMessage,
}: {
  readonly entropy: number;
  readonly seed: number | null;
  readonly accentColor: string;
  readonly spinCost: number;
  readonly disabled: boolean;
  readonly onSpin: () => Promise<NebulaSlotsSpinResult>;
  readonly onResult: (result: NebulaSlotsSpinResult) => void;
  readonly onForceAdvance?: (() => void) | null;
  readonly forceAdvanceLabel?: string;
  readonly forceAdvanceMessage?: string;
}) => {
  const [positions, setPositions] = useState(() =>
    symbolsToPositions(generatePreviewSymbols(seed, entropy, 0)),
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const [reelSpinning, setReelSpinning] = useState<boolean[]>([false, false, false]);
  const [outcome, setOutcome] = useState<NebulaSlotsSpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reelStopped, setReelStopped] = useState<boolean[]>([false, false, false]);
  const [celebrating, setCelebrating] = useState(false);

  const reelIntervalsRef = useRef<Array<number | null>>([null, null, null]);
  const reelStopTimeoutsRef = useRef<number[]>([]);
  const aliveRef = useRef(true);

  const displaySymbols = useMemo(
    () => positions.map((position) => getReelSymbolAt(position, REEL_VISIBLE_CENTER_OFFSET)),
    [positions],
  );

  const clearTimers = useCallback(() => {
    reelIntervalsRef.current.forEach((intervalId, index) => {
      if (intervalId !== null && intervalId !== undefined) {
        window.clearInterval(intervalId);
        reelIntervalsRef.current[index] = null;
      }
    });
    reelStopTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    reelStopTimeoutsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    // Keep reels parked on resolved symbols until the next spin clears outcome/error.
    if (isSpinning || outcome || error) return;
    const preview = generatePreviewSymbols(seed, entropy, 0);
    setPositions(symbolsToPositions(preview));
  }, [entropy, seed, isSpinning, outcome, error]);

  const scheduleCelebrationReset = useCallback(() => {
    const timeoutId = window.setTimeout(() => {
      if (aliveRef.current) setCelebrating(false);
    }, CELEBRATION_FLASH_DURATION_MS);
    reelStopTimeoutsRef.current.push(timeoutId);
  }, []);

  const spinsAvailable = Math.max(0, Math.floor(Math.max(0, entropy) / Math.max(1, spinCost)));
  const shortfall = Math.max(0, spinCost - Math.floor(Math.max(0, entropy)));
  const buttonDisabled = disabled || isSpinning || spinsAvailable <= 0;
  const buttonLabel = isSpinning ? 'Spinning…' : 'Spin Nebula Slots';
  const showForceAdvance = typeof onForceAdvance === 'function';
  const forceAdvanceCta = forceAdvanceLabel ?? 'Continue without wagering';
  const fallbackMessage =
    forceAdvanceMessage ??
    'Not enough stored entropy to spin or commit. Continue to start the next volley.';

  const machineClass = cn(
    'relative overflow-hidden rounded-[22px] border border-white/14 bg-[rgba(16,8,28,0.72)] shadow-[0_14px_32px_rgba(0,0,0,0.32)] transition-shadow duration-300',
    isSpinning
      ? 'shadow-[0_0_26px_rgba(120,190,255,0.32)] border-[rgba(255,255,255,0.18)]'
      : undefined,
    celebrating || (outcome && (outcome.rarity === 'jackpot' || outcome.rarity === 'bias'))
      ? 'shadow-[0_0_36px_rgba(255,214,110,0.45)] border-[rgba(255,214,110,0.4)]'
      : undefined,
    error
      ? 'border-[color:var(--casino-accent-danger,#ff3355)] shadow-[0_0_26px_rgba(255,83,83,0.35)]'
      : undefined,
  );

  const messageEmoji = (() => {
    if (error) return '⚠️';
    if (!outcome) return isSpinning ? '🎰' : '✨';
    switch (outcome.rarity) {
      case 'jackpot':
        return '🎉';
      case 'bias':
        return '🧭';
      case 'tease':
        return '🌌';
      default:
        return '🪐';
    }
  })();

  const rarityTone: Record<NebulaSlotsSpinResult['rarity'], string> = {
    jackpot: 'text-[rgba(255,214,110,0.92)] drop-shadow-[0_0_18px_rgba(255,214,110,0.5)]',
    bias: 'text-[rgba(120,190,255,0.9)] drop-shadow-[0_0_14px_rgba(120,190,255,0.45)]',
    tease: 'text-[rgba(255,224,180,0.78)]',
    miss: 'text-white/70',
  };

  const headlineClass = outcome
    ? rarityTone[outcome.rarity]
    : error
      ? 'text-[color:var(--casino-accent-danger,#ff3355)]'
      : 'text-[rgba(255,224,180,0.78)]';

  const detailClass = error
    ? 'text-[color:var(--casino-accent-danger,#ff3355)] text-sm'
    : 'text-[clamp(12px,1.6vmin,15px)] text-white/70';

  // --- helpers for the new stop sequence ---
  const startReelSpin = (reelIndex: number, intervalMs: number) => {
    setReelSpinning((previous) => {
      const next = [...previous];
      next[reelIndex] = true;
      return next;
    });
    const intervalId = window.setInterval(() => {
      setPositions((previous) => {
        const next = [...previous];
        let value = previous[reelIndex] + 1;
        const windowStart = EXTENDED_REEL_LENGTH;
        const doubleLength = EXTENDED_REEL_LENGTH * 2;
        if (value >= doubleLength) {
          value -= EXTENDED_REEL_LENGTH;
        }
        if (value < windowStart) {
          value += EXTENDED_REEL_LENGTH;
        }
        next[reelIndex] = value;
        return next;
      });
    }, intervalMs);
    reelIntervalsRef.current[reelIndex] = intervalId;
  };

  const stopReelOn = (reelIndex: number, finalSymbol: NebulaSlotSymbol) => {
    setReelSpinning((previous) => {
      const next = [...previous];
      next[reelIndex] = false;
      return next;
    });

    const intervalId = reelIntervalsRef.current[reelIndex];
    if (intervalId !== null && intervalId !== undefined) {
      window.clearInterval(intervalId);
      reelIntervalsRef.current[reelIndex] = null;
    }

    setPositions((previous) => {
      const next = [...previous];
      const current = previous[reelIndex];
      let baseTarget = computeTargetIndex(current, finalSymbol);
      const minAdvance = Math.ceil(EXTENDED_REEL_LENGTH * 0.25);
      if (baseTarget - current < minAdvance) {
        baseTarget += EXTENDED_REEL_LENGTH;
      }
      const doubleLength = EXTENDED_REEL_LENGTH * 2;
      while (baseTarget >= doubleLength) {
        baseTarget -= EXTENDED_REEL_LENGTH;
      }
      while (baseTarget < EXTENDED_REEL_LENGTH) {
        baseTarget += EXTENDED_REEL_LENGTH;
      }
      next[reelIndex] = baseTarget;
      return next;
    });

    const doneId = window.setTimeout(() => {
      if (!aliveRef.current) {
        return;
      }
      setReelStopped((previous) => {
        const next = [...previous];
        next[reelIndex] = true;
        return next;
      });
      // Re-center every reel into the second cycle so the next spin has runway.
      setPositions((current) =>
        current.map((value) => {
          let normalized = value % EXTENDED_REEL_LENGTH;
          if (normalized < 0) {
            normalized += EXTENDED_REEL_LENGTH;
          }
          return EXTENDED_REEL_LENGTH + normalized;
        }),
      );
    }, 780);
    reelStopTimeoutsRef.current.push(doneId);
  };

  const handleSpin = async () => {
    if (disabled || isSpinning || spinsAvailable <= 0) {
      return;
    }

    clearTimers();
    setIsSpinning(true);
    setError(null);
    setOutcome(null);
    setCelebrating(false);
    setReelStopped([false, false, false]);

    const previewOffset = Math.floor(performance.now() % 997);
    const teaserSymbols = generatePreviewSymbols(seed, entropy, previewOffset);
    setPositions(symbolsToPositions(teaserSymbols));

    [0, 1, 2].forEach((reelIndex) => {
      const intervalMs = SPIN_INTERVALS_MS[reelIndex] ?? 60;
      startReelSpin(reelIndex, intervalMs);
    });

    let result: NebulaSlotsSpinResult;
    try {
      result = await onSpin();
    } catch (caught) {
      setError(resolveSlotsErrorMessage(caught));
      clearTimers();
      setIsSpinning(false);
      setReelSpinning([false, false, false]);
      setReelStopped([false, false, false]);
      return;
    }

    if (!aliveRef.current) {
      return;
    }

    const delays = IS_TEST_ENV ? [180, 260, 360] : [900, 1250, 1600];
    delays.forEach((delay, reelIndex) => {
      const timeoutId = window.setTimeout(() => {
        if (!aliveRef.current) {
          return;
        }
        const finalSymbol = result.symbols[reelIndex] ?? slotSymbols[0];
        stopReelOn(reelIndex, finalSymbol);

        const isFinal = reelIndex === delays.length - 1;
        if (isFinal) {
          const revealId = window.setTimeout(() => {
            if (!aliveRef.current) {
              return;
            }
            setOutcome(result);
            try {
              onResult(result);
            } catch (callbackError) {
              console.error('Nebula slots onResult handler failed', callbackError);
            }
            if (result.rarity === 'jackpot' || result.rarity === 'bias') {
              setCelebrating(true);
              scheduleCelebrationReset();
            }
            setIsSpinning(false);
          }, 820);
          reelStopTimeoutsRef.current.push(revealId);
        }
      }, delay);
      reelStopTimeoutsRef.current.push(timeoutId);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={machineClass}>
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="flex justify-center gap-6 p-6">
          {positions.map((position, index) => (
            <SlotReel
              key={`nebula-slot-${index}`}
              position={position}
              accentColor={accentColor}
              spinning={isSpinning && !reelStopped[index] && reelSpinning[index]}
              highlight={
                !error && reelStopped[index] && outcome?.symbols[index] === displaySymbols[index]
              }
              reelIndex={index}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1 p-4 text-center">
          <span
            className={cn(
              'flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.18em]',
              headlineClass,
            )}
            aria-live="polite"
          >
            <span aria-hidden>{messageEmoji}</span>
            <span>{error ?? outcome?.headline ?? 'Spend entropy to tease the next bias.'}</span>
          </span>
          <span className={detailClass}>
            {error ??
              outcome?.detail ??
              (showForceAdvance
                ? fallbackMessage
                : 'Three reels align the cosmic tide. Matching sigils hint which bias will sing next.')}
          </span>
          {!error && outcome ? (
            <div
              className="mt-2 flex items-center justify-center gap-3 text-3xl"
              aria-hidden="true"
            >
              {outcome.symbols.map((symbol, index) => (
                <span key={`resolved-symbol-${symbol}-${index}`}>{getSymbolEmoji(symbol)}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="ui-interactive rounded-full border border-[rgba(255,214,110,0.6)] bg-gradient-to-br from-[rgba(255,212,92,0.22)] via-[rgba(255,178,85,0.22)] to-[rgba(255,122,120,0.22)] px-6 py-2 text-sm font-semibold tracking-wide text-[color:var(--casino-text-primary,#fbeedd)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            onClick={handleSpin}
            disabled={buttonDisabled}
            size="sm"
          >
            {buttonLabel}
          </Button>
          {showForceAdvance ? (
            <Button
              variant="ghost"
              className="ui-interactive rounded-full border border-white/18 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(255,224,180,0.78)] hover:text-[color:var(--casino-accent-power,#ff7b33)] disabled:opacity-60"
              size="sm"
              onClick={() => {
                onForceAdvance?.();
              }}
              disabled={disabled || isSpinning}
            >
              {forceAdvanceCta}
            </Button>
          ) : null}
        </div>
        <div className="text-right text-xs uppercase tracking-[0.14em] text-[rgba(255,224,180,0.68)]">
          <div>Cost: {spinCost} entropy</div>
          <div>
            {spinsAvailable > 0
              ? `Spins left: ${spinsAvailable}`
              : `Need ${Math.max(1, shortfall)} more entropy`}
          </div>
        </div>
      </div>
    </div>
  );
};

const OptionCard = ({
  option,
  selected,
  disabled,
  locked,
  onSelect,
}: {
  readonly option: BiasPhaseSceneOption;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly locked: boolean;
  readonly onSelect: (optionId: string) => void;
}) => (
  <button
    type="button"
    className={cn(
      'ui-interactive flex h-full flex-col gap-4 rounded-[24px] border p-5 text-left transition-all duration-200',
      'hover:-translate-y-[3px] hover:shadow-[0_18px_38px_rgba(255,214,110,0.22)] focus-visible:-translate-y-[3px]',
      selected
        ? 'border-[rgba(255,214,110,0.82)] shadow-[0_20px_44px_rgba(255,214,110,0.25)]'
        : 'border-white/12',
      locked ? 'opacity-70 saturate-75' : undefined,
    )}
    style={{
      background:
        'linear-gradient(165deg, rgba(32, 20, 58, 0.88), rgba(18, 8, 34, 0.78)), radial-gradient(circle at 20% 20%, rgba(255, 214, 110, 0.08), transparent 65%)',
    }}
    onClick={() => {
      if (!disabled) {
        onSelect(option.id);
      }
    }}
    disabled={disabled}
  >
    <span
      className="inline-flex w-fit items-center justify-center rounded-full px-4 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-stone-950"
      style={{ backgroundColor: 'rgba(255, 214, 110, 0.86)' }}
    >
      {riskLabel[option.risk]}
    </span>
    <span className="text-[clamp(20px,2.6vmin,30px)] font-extrabold tracking-[0.04em] text-white">
      {option.label}
    </span>
    <p className="text-[clamp(14px,1.6vmin,18px)] leading-relaxed text-[rgba(255,224,180,0.8)]">
      {option.description}
    </p>
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-[rgba(255,224,180,0.78)]">
      {option.wager.label}
    </span>
    <ul className="flex flex-col gap-1 text-[clamp(12px,1.4vmin,15px)] text-white/85">
      {option.effectSummary.map((line, index) => (
        <li
          key={`${option.id}-effect-${index}`}
          className="before:text-[rgba(255,214,110,0.92)] before:content-['•\00a0']"
        >
          {line}
        </li>
      ))}
    </ul>
    <span className="mt-auto text-xs uppercase tracking-[0.12em] text-white/70">
      {locked
        ? 'Earn more entropy to unlock'
        : selected
          ? 'Selected — tap to change'
          : 'Tap to select this table'}
    </span>
  </button>
);

const scoreboardEntries: readonly {
  readonly label: string;
  readonly resolve: (session: BiasPhaseSessionSummary) => string;
}[] = [
  { label: 'Next Level', resolve: (session) => `Level ${session.nextLevel}` },
  { label: 'Score', resolve: (session) => formatNumber(session.score) },
  { label: 'Coins', resolve: (session) => formatNumber(session.coins) },
  { label: 'Lives', resolve: (session) => `${session.lives}` },
  { label: 'Highest Combo', resolve: (session) => `×${session.highestCombo}` },
  { label: 'Entropy Delta', resolve: (session) => formatSignedDelta(session.entropyDelta, 0) },
  { label: 'Gravity Bias', resolve: formatGravityBias },
  { label: 'Speed Bias', resolve: formatSpeedBias },
  { label: 'Coins Rule', resolve: (session) => (session.coinsRuleLocked ? 'Locked' : 'Open') },
];

const rouletteSegments = [
  { color: 'rgba(255, 212, 92, 0.82)', label: 'Tilt' },
  { color: 'rgba(120, 190, 255, 0.75)', label: 'Jackpot' },
  { color: 'rgba(255, 120, 160, 0.78)', label: 'Lock' },
  { color: 'rgba(140, 250, 200, 0.72)', label: 'Wild' },
  { color: 'rgba(255, 170, 90, 0.84)', label: 'Reforge' },
  { color: 'rgba(90, 160, 255, 0.78)', label: 'Combo' },
];

const buildRouletteGradient = () => {
  const sectorSize = 100 / rouletteSegments.length;
  return rouletteSegments
    .map((segment, index) => {
      const start = index * sectorSize;
      const end = (index + 1) * sectorSize;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(', ');
};

const RouletteWheel = ({ accentColor }: { readonly accentColor: string }) => {
  const diskRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let angle = 0;
    const tick = (timestamp: number) => {
      angle = (angle + timestamp * 0.00012) % 360;
      const node = diskRef.current;
      if (node) {
        node.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative h-48 w-48 rounded-full border-4 border-white/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.22),rgba(16,8,28,0.92))] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <div
          ref={diskRef}
          className="absolute left-1/2 top-1/2 h-[calc(100%-16px)] w-[calc(100%-16px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30"
          style={{
            background: `conic-gradient(${buildRouletteGradient()})`,
            boxShadow: '0 0 22px rgba(255, 214, 110, 0.3)',
          }}
        />
        <div className="absolute left-1/2 top-0 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-b-full bg-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.4)]" />
        <div
          className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-[radial-gradient(circle,rgba(255,255,255,0.75),rgba(255,165,90,0.85),rgba(80,10,60,0.82))] shadow-[inset_0_0_18px_rgba(0,0,0,0.38)]"
          style={{ boxShadow: `0 0 14px ${accentColor}` }}
        />
      </div>
    </div>
  );
};

export const CasinoHubApp = (): JSX.Element | null => {
  const { theme } = useGameTheme();
  const { visible, suspended, payload } = useBiasPhaseUi();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'commit' | 'skip' | null>(null);
  const [entropyBalance, setEntropyBalance] = useState(() => payload?.session.entropyStored ?? 0);

  useEffect(() => {
    setSelectedOptionId(null);
    setPendingAction(null);
    setEntropyBalance(payload?.session.entropyStored ?? 0);
  }, [payload]);

  const overlayStyle = useMemo(
    () =>
      ({
        '--casino-bg-from': theme.background.from,
        '--casino-bg-to': theme.background.to,
        '--casino-panel-fill': theme.hud.panelFill,
        '--casino-panel-line': theme.hud.panelLine,
        '--casino-text-primary': theme.hud.textPrimary,
        '--casino-text-secondary': theme.hud.textSecondary,
        '--casino-accent-power': theme.accents.powerUp,
        '--casino-accent-combo': theme.accents.combo,
        '--casino-accent-danger': theme.hud.danger,
      }) as CSSProperties,
    [theme],
  );

  const surfaceStyle = useMemo(
    () =>
      ({
        background:
          'linear-gradient(165deg, rgba(20, 12, 38, 0.92), rgba(42, 18, 64, 0.84)), radial-gradient(circle at 20% 80%, rgba(255, 200, 120, 0.16), transparent 60%)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const handleSlotsOutcome = useCallback(
    (result: NebulaSlotsSpinResult) => {
      setEntropyBalance(result.entropyRemaining);
    },
    [setEntropyBalance],
  );

  if (!visible || suspended || !payload) {
    return null;
  }

  const { session, options, onSelect, onSkip, slots: slotsGame } = payload;
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;
  const entropyShortfall = selectedOption
    ? Math.max(0, selectedOption.wager.cost - entropyBalance)
    : 0;
  const commitDisabled = !selectedOptionId || pendingAction !== null || entropyShortfall > 0;

  const hasAffordableOption = options.some(
    (option) => option.wager.cost <= entropyBalance + ENTROPY_SPEND_TOLERANCE,
  );
  const spinCost = slotsGame?.cost ?? null;
  const canSpinWithBalance =
    spinCost !== null && entropyBalance + ENTROPY_SPEND_TOLERANCE >= spinCost;
  const showForceAdvance = Boolean(onSkip) && !hasAffordableOption && !canSpinWithBalance;

  const commitLabel = (() => {
    if (pendingAction === 'commit') {
      return 'Committing…';
    }
    if (!selectedOptionId || !selectedOption) {
      return 'Commit Selection';
    }
    if (entropyShortfall > 0) {
      return `Need ${entropyShortfall} more entropy`;
    }
    return `Commit ${selectedOption.label}`;
  })();

  const handleSelect = (optionId: string) => {
    if (pendingAction) {
      return;
    }
    setSelectedOptionId(optionId);
  };

  const handleCommit = async () => {
    if (!selectedOptionId || pendingAction) {
      return;
    }
    try {
      setPendingAction('commit');
      await onSelect(selectedOptionId);
    } catch (error) {
      console.error('Failed to commit casino wager', error);
      setPendingAction(null);
    }
  };

  const handleSkip = async () => {
    if (!onSkip || pendingAction) {
      return;
    }
    try {
      setPendingAction('skip');
      await onSkip();
    } catch (error) {
      console.error('Failed to skip casino wager', error);
      setPendingAction(null);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[6] flex items-stretch justify-center px-4 py-6 sm:py-10"
      style={overlayStyle}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 30% 80%, rgba(255, 140, 120, 0.16), transparent 55%), radial-gradient(circle at 78% 18%, rgba(102, 198, 255, 0.18), transparent 60%), linear-gradient(160deg, rgba(2, 0, 18, 0.82), rgba(8, 2, 24, 0.88))',
        }}
      />
      <div
        className="ui-interactive relative flex w-full max-w-[1200px] flex-col gap-6 overflow-hidden rounded-[32px] border px-6 py-8 text-[color:var(--casino-text-primary,#fbeedd)] shadow-[0_42px_82px_rgba(8,4,20,0.62)] backdrop-blur-3xl sm:gap-8 sm:px-10 sm:py-10"
        style={surfaceStyle}
      >
        <header className="flex flex-col gap-3 text-center">
          <span className="text-sm uppercase tracking-[0.34em] text-white/60">
            Sanctum Bias Phase
          </span>
          <h1 className="font-display text-[clamp(46px,6.2vw,78px)] uppercase tracking-[0.08em] text-[color:var(--casino-accent-combo,#ffd45c)] drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]">
            Mayhaps&apos; Cosmic Casino
          </h1>
          <p className="mx-auto max-w-3xl text-[clamp(15px,2.1vmin,20px)] tracking-[0.04em] text-[color:var(--casino-text-secondary,#ffc45a)]">
            Trade entropy for impossible odds. Spin the architect&apos;s roulette, sample the slots,
            or lock in a bias that shapes the next volley.
          </p>
        </header>

        <section
          className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]"
          aria-label="Casino controls"
        >
          <div className="flex flex-col gap-6">
            <Panel
              tone="muted"
              className="ui-interactive rounded-[26px] border text-[color:var(--casino-text-primary,#fbeedd)]"
              style={{
                background:
                  'linear-gradient(150deg, rgba(32, 18, 58, 0.86), rgba(18, 10, 32, 0.78))',
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs uppercase tracking-[0.22em] text-[rgba(255,224,180,0.72)]">
                    Entropy Vault
                  </span>
                  <span className="text-[clamp(32px,4vmin,46px)] font-black tracking-[0.04em] text-[color:var(--casino-accent-combo,#ffd45c)]">
                    {formatNumber(entropyBalance)}
                  </span>
                  <span className="text-[clamp(12px,1.6vmin,15px)] text-[rgba(255,224,180,0.65)]">
                    Each wager draws from this reserve. Earn more by smashing entropy bricks.
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {scoreboardEntries.slice(0, 2).map((entry) => (
                    <div
                      key={entry.label}
                      className="rounded-[18px] border border-white/12 bg-white/6 px-4 py-3 text-left"
                    >
                      <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(255,224,180,0.72)]">
                        {entry.label}
                      </span>
                      <span className="text-[clamp(16px,2vmin,22px)] font-semibold tracking-wide">
                        {entry.resolve(session)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              tone="muted"
              className="ui-interactive rounded-[26px] border text-[color:var(--casino-text-primary,#fbeedd)]"
              style={{
                background:
                  'linear-gradient(155deg, rgba(26, 14, 46, 0.86), rgba(18, 10, 32, 0.78))',
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {scoreboardEntries.slice(2).map((entry) => (
                  <div key={entry.label} className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(255,224,180,0.65)]">
                      {entry.label}
                    </span>
                    <span className="text-[clamp(15px,1.9vmin,20px)] font-semibold tracking-wide">
                      {entry.resolve(session)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="grid gap-5 md:grid-cols-2" aria-label="Wagering options">
              {options.map((option) => {
                const optionDisabled = pendingAction !== null;
                const locked = option.wager.cost > entropyBalance;
                const selected = option.id === selectedOptionId;
                return (
                  <OptionCard
                    key={option.id}
                    option={option}
                    disabled={optionDisabled}
                    locked={locked}
                    selected={selected}
                    onSelect={handleSelect}
                  />
                );
              })}
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <Panel
              tone="muted"
              className="ui-interactive flex flex-col gap-5 rounded-[26px] border p-6 text-[color:var(--casino-text-primary,#fbeedd)]"
              style={{
                background:
                  'linear-gradient(155deg, rgba(26, 12, 46, 0.86), rgba(12, 6, 24, 0.78)), radial-gradient(circle at 20% 15%, rgba(255, 214, 110, 0.16), transparent 65%)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-[rgba(255,224,180,0.72)]">
                  Fate Roulette
                </span>
                <span className="text-[clamp(18px,2.4vmin,24px)] font-semibold tracking-[0.06em]">
                  Spindle of Possibility
                </span>
                <p className="text-[clamp(13px,1.6vmin,16px)] text-[rgba(255,224,180,0.72)]">
                  The wheel forecasts upcoming bias weights. Higher entropy wagers unlock rarer
                  slices.
                </p>
              </div>
              <RouletteWheel accentColor={theme.accents.combo} />
            </Panel>

            <Panel
              tone="muted"
              className="ui-interactive rounded-[26px] border p-5 text-[color:var(--casino-text-primary,#fbeedd)]"
              style={{
                background:
                  'linear-gradient(150deg, rgba(24, 12, 38, 0.88), rgba(10, 4, 22, 0.78)), radial-gradient(circle at 70% 20%, rgba(120, 190, 255, 0.12), transparent 60%)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="flex flex-col gap-3">
                <div>
                  <span className="font-mono text-xs uppercase tracking-[0.22em] text-[rgba(255,224,180,0.68)]">
                    Nebula Slots
                  </span>
                  <span className="block text-[clamp(18px,2.2vmin,22px)] font-semibold tracking-[0.05em]">
                    {slotsGame ? 'Nebula Slots' : 'Nebula Slots (offline)'}
                  </span>
                </div>
                {slotsGame ? (
                  <>
                    <NebulaSlotsGame
                      key={`slots-${session.nextLevel}-${session.seed ?? 0}`}
                      entropy={entropyBalance}
                      seed={session.seed}
                      accentColor={theme.accents.powerUp}
                      spinCost={slotsGame.cost}
                      disabled={pendingAction !== null}
                      onSpin={slotsGame.onSpin}
                      onResult={handleSlotsOutcome}
                      onForceAdvance={
                        showForceAdvance && pendingAction === null
                          ? () => {
                              void handleSkip();
                            }
                          : null
                      }
                      forceAdvanceLabel="Continue without wagering"
                      forceAdvanceMessage="Insufficient entropy to wager. Continue to start the next volley."
                    />
                    <p className="text-[clamp(13px,1.6vmin,16px)] text-[rgba(255,224,180,0.72)]">
                      Each spin costs {slotsGame.cost} entropy. Align the reels to sniff out which
                      bias will surge next volley.
                    </p>
                  </>
                ) : (
                  <>
                    <SlotsPreview
                      entropy={entropyBalance}
                      seed={session.seed}
                      accentColor={theme.accents.powerUp}
                    />
                    <p className="text-[clamp(13px,1.6vmin,16px)] text-[rgba(255,224,180,0.72)]">
                      Placeholder mini-game interface. Once wired, spend entropy to chase rare
                      sigils and volatility boosts.
                    </p>
                  </>
                )}
              </div>
            </Panel>
          </aside>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex flex-col gap-2 text-[clamp(12px,1.6vmin,14px)] text-[rgba(255,224,180,0.72)]">
            <span aria-live="polite">
              {session.seed !== null ? `Seed #${session.seed}` : 'Seed pending — commit to lock'}
            </span>
            {onSkip ? (
              <Button
                variant="ghost"
                className="ui-interactive w-fit rounded-full border border-white/20 text-xs uppercase tracking-[0.12em] text-[rgba(255,224,180,0.72)] hover:text-[color:var(--casino-accent-power,#ff7b33)]"
                onClick={handleSkip}
                disabled={pendingAction !== null}
                size="sm"
              >
                Hold for default path
              </Button>
            ) : null}
          </div>
          <Button
            className="ui-interactive min-w-[240px] rounded-full border-2 border-[rgba(255,214,110,0.82)] bg-gradient-to-br from-[rgba(255,212,92,0.95)] via-[rgba(255,178,85,0.92)] to-[rgba(255,122,120,0.92)] text-base font-extrabold tracking-wide text-stone-950 shadow-[0_18px_42px_rgba(255,178,85,0.35)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            onClick={handleCommit}
            disabled={commitDisabled}
            size="lg"
          >
            {commitLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
};

export const CasinoHub = CasinoHubApp;
