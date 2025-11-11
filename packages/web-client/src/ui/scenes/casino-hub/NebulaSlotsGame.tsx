import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, cn } from '@lucky-break/design-system';
import type { NebulaSlotsSpinResult } from 'scenes/bias-phase';
import { NEBULA_SLOT_SYMBOLS, type NebulaSlotSymbol } from 'app/runtime/casino-games';
import { modulo } from 'util/math';

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
const REEL_VISIBLE_COUNT = 1;
const REEL_VISIBLE_CENTER_OFFSET = 0;
const REEL_WINDOW_HEIGHT = REEL_ITEM_HEIGHT;
const REEL_CENTER_SHIFT = 0;
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

const getReelSymbolAt = (position: number, offset = 0): NebulaSlotSymbol => {
  const index = modulo(position + offset, EXTENDED_REEL_LENGTH);
  return EXTENDED_REEL_SYMBOLS[index];
};

const BASE_LOOP_OFFSET = slotSymbols.length * Math.floor(REEL_REPEAT_COUNT / 2);
const SPIN_INTERVALS_MS: readonly number[] = [30, 36, 42];
const CELEBRATION_FLASH_DURATION_MS = 2600;
const DEFAULT_ERROR_MESSAGE = 'Nebula slots jammed. Try again shortly.';

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
    return BASE_LOOP_OFFSET + resolvedIndex;
  });

const computeTargetIndex = (currentTop: number, symbol: NebulaSlotSymbol): number => {
  const indices = SYMBOL_INDEX_LOOKUP[symbol] ?? SYMBOL_INDEX_LOOKUP[slotSymbols[0]];
  const cycleLength = EXTENDED_REEL_LENGTH;
  const normalizedCurrent = modulo(currentTop, cycleLength);
  const cycleBase = currentTop - normalizedCurrent;

  for (const loopOffset of [0, cycleLength]) {
    for (const index of indices) {
      const candidateTop = cycleBase + loopOffset + index;
      if (candidateTop >= currentTop) {
        return candidateTop;
      }
    }
  }

  const fallbackIndex = indices[0] ?? 0;
  return cycleBase + cycleLength + fallbackIndex;
};

const getSymbolEmoji = (symbol: NebulaSlotSymbol): string => SLOT_SYMBOL_EMOJI[symbol] ?? '✨';

type ReelPhase = 'idle' | 'spinning' | 'settling';

interface CelebrationParticle {
  readonly id: number;
  readonly left: number;
  readonly top: number;
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly delay: number;
}

type CelebrationParticleStyle = CSSProperties & {
  '--burst-dx': string;
  '--burst-dy': string;
  '--burst-scale': string;
};

const ensureNebulaSlotsStyles = () => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById('nebula-slots-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'nebula-slots-style';
  style.textContent = `
    @keyframes nebula-slot-particle-burst {
      0% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(var(--burst-scale, 1));
      }
      55% {
        opacity: 0.9;
        transform: translate(calc(-50% + var(--burst-dx, 0px)), calc(-50% + var(--burst-dy, 0px)))
          scale(calc(var(--burst-scale, 1) * 1.18));
      }
      100% {
        opacity: 0;
        transform: translate(calc(-50% + var(--burst-dx, 0px)), calc(-50% + var(--burst-dy, 0px)))
          scale(calc(var(--burst-scale, 1) * 0.78));
      }
    }

    @keyframes nebula-slot-gentle-bob {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-6px);
      }
    }
  `;
  document.head.appendChild(style);
};

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
  readonly phase: ReelPhase;
}

const SlotReel = ({ position, accentColor, spinning, highlight, phase }: SlotReelProps) => {
  const doubledTrack = useMemo(
    () => [...EXTENDED_REEL_SYMBOLS, ...EXTENDED_REEL_SYMBOLS] as readonly NebulaSlotSymbol[],
    [],
  );
  const centerHighlightIndex = modulo(position, EXTENDED_REEL_LENGTH);
  const translateY = -(position * REEL_ITEM_HEIGHT);

  const transitionDuration =
    phase === 'spinning' ? '90ms' : phase === 'settling' ? '460ms' : '680ms';
  const transitionTiming =
    phase === 'spinning'
      ? 'linear'
      : phase === 'settling'
        ? 'cubic-bezier(0.18, 0.9, 0.16, 1)'
        : 'cubic-bezier(0.24, 0.78, 0.24, 0.98)';
  const isIdle = phase === 'idle';

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
          const isCenter = index % EXTENDED_REEL_LENGTH === centerHighlightIndex;
          const emojiStyle =
            isIdle && isCenter
              ? {
                  animation: 'nebula-slot-gentle-bob 2600ms ease-in-out infinite',
                  animationDelay: `${(index % EXTENDED_REEL_LENGTH) * 24}ms`,
                }
              : undefined;
          return (
            <div
              key={`nebula-reel-symbol-${index}`}
              className={cn(
                'flex h-[68px] w-full flex-col items-center justify-center text-4xl font-semibold leading-none text-white/85',
                showHighlight ? 'scale-110 text-white' : undefined,
              )}
              aria-hidden="true"
            >
              <span style={emojiStyle}>{getSymbolEmoji(symbol)}</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {symbol}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-x-3 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
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

export const SlotsPreview = ({
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

export interface NebulaSlotsGameProps {
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
}

export const NebulaSlotsGame = ({
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
}: NebulaSlotsGameProps) => {
  const [positions, setPositions] = useState(() =>
    symbolsToPositions(generatePreviewSymbols(seed, entropy, 0)),
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const [reelSpinning, setReelSpinning] = useState<boolean[]>([false, false, false]);
  const [outcome, setOutcome] = useState<NebulaSlotsSpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reelStopped, setReelStopped] = useState<boolean[]>([false, false, false]);
  const [celebrating, setCelebrating] = useState(false);
  const [reelPhase, setReelPhase] = useState<ReelPhase[]>(['idle', 'idle', 'idle']);
  const [particles, setParticles] = useState<CelebrationParticle[]>([]);

  const reelIntervalsRef = useRef<Array<number | null>>([null, null, null]);
  const reelStopTimeoutsRef = useRef<number[]>([]);
  const aliveRef = useRef(true);
  const particleIdRef = useRef(0);
  const machineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureNebulaSlotsStyles();
  }, []);

  const displaySymbols = useMemo(
    () => positions.map((position) => getReelSymbolAt(position, 0)),
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
    if (isSpinning || outcome || error) return;
    const preview = generatePreviewSymbols(seed, entropy, 0);
    setPositions(symbolsToPositions(preview));
  }, [entropy, seed, isSpinning, outcome, error]);

  const scheduleCelebrationReset = useCallback(() => {
    const timeoutId = window.setTimeout(() => {
      if (!aliveRef.current) {
        return;
      }
      setCelebrating(false);
      setParticles([]);
    }, CELEBRATION_FLASH_DURATION_MS);
    reelStopTimeoutsRef.current.push(timeoutId);
  }, []);

  const spawnCelebrationParticles = useCallback(() => {
    const container = machineRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const particleCount = 18;
    const created: CelebrationParticle[] = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const radial = rect.width * (0.16 + Math.random() * 0.24);
      const drift = rect.height * 0.22;
      const dx = Math.cos(angle) * radial;
      const dy = Math.sin(angle) * drift;
      const id = particleIdRef.current++;
      return {
        id,
        left: rect.width / 2,
        top: rect.height / 2,
        dx,
        dy,
        scale: 0.75 + Math.random() * 0.55,
        delay: Math.random() * 180,
      } satisfies CelebrationParticle;
    });
    setParticles((previous) => [...previous, ...created]);
    const cleanupId = window.setTimeout(() => {
      if (!aliveRef.current) {
        return;
      }
      setParticles([]);
    }, 1200);
    reelStopTimeoutsRef.current.push(cleanupId);
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

  const startReelSpin = (reelIndex: number, intervalMs: number) => {
    setReelSpinning((previous) => {
      const next = [...previous];
      next[reelIndex] = true;
      return next;
    });
    setReelPhase((previous) => {
      const next = [...previous];
      next[reelIndex] = 'spinning';
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
    setReelPhase((previous) => {
      const next = [...previous];
      next[reelIndex] = 'settling';
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
      const minAdvance = Math.ceil(EXTENDED_REEL_LENGTH * 0.4);
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
      setReelPhase((previous) => {
        const next = [...previous];
        next[reelIndex] = 'idle';
        return next;
      });
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
    setParticles([]);
    setReelStopped([false, false, false]);
    setReelPhase(['spinning', 'spinning', 'spinning']);

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
      setReelPhase(['idle', 'idle', 'idle']);
      return;
    }

    if (!aliveRef.current) {
      setIsSpinning(false);
      return;
    }

    const delays = IS_TEST_ENV ? [180, 260, 360] : [1800, 2100, 2400];
    delays.forEach((delay, reelIndex) => {
      const timeoutId = window.setTimeout(() => {
        if (!aliveRef.current) {
          setIsSpinning(false);
          return;
        }
        const finalSymbol = result.symbols[reelIndex] ?? slotSymbols[0];
        stopReelOn(reelIndex, finalSymbol);

        const isFinal = reelIndex === delays.length - 1;
        if (isFinal) {
          const revealId = window.setTimeout(() => {
            if (!aliveRef.current) {
              setIsSpinning(false);
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
              spawnCelebrationParticles();
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
      <div className={machineClass} ref={machineRef}>
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          {particles.map((particle) => {
            const style: CelebrationParticleStyle = {
              left: `${particle.left}px`,
              top: `${particle.top}px`,
              animation: 'nebula-slot-particle-burst 900ms ease-out forwards',
              animationDelay: `${particle.delay}ms`,
              transform: 'translate(-50%, -50%)',
              '--burst-dx': `${particle.dx}px`,
              '--burst-dy': `${particle.dy}px`,
              '--burst-scale': `${particle.scale}`,
            };
            return (
              <span
                key={`nebula-slot-particle-${particle.id}`}
                className="absolute text-2xl text-white/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.75)]"
                style={style}
                aria-hidden="true"
              >
                ✨
              </span>
            );
          })}
        </div>
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
              phase={reelPhase[index] ?? 'idle'}
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
