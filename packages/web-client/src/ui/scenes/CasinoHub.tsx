import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, Panel } from '@lucky-break/design-system';
import type { BiasPhaseSessionSummary, NebulaSlotsSpinResult } from 'scenes/bias-phase';
import { useBiasPhaseUi } from '../state/bias-phase-bridge';
import { useGameTheme } from '../hooks/useGameTheme';
import { OptionCard } from './casino-hub/OptionCard';
import { RouletteWheel } from './casino-hub/RouletteWheel';
import { NebulaSlotsGame, SlotsPreview } from './casino-hub/NebulaSlotsGame';
import {
  formatGravityBias,
  formatNumber,
  formatSignedDelta,
  formatSpeedBias,
} from './casino-hub/formatting';

const ENTROPY_SPEND_TOLERANCE = 1e-3;

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
