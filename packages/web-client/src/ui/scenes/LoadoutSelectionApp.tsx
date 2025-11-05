import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameTheme } from '../hooks/useGameTheme';
import { useLoadoutSelectionUi } from '../state/loadout-selection-bridge';
import type { LoadoutFormPreset } from 'app/runtime/loadouts';

const toHexColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const summarize = (preset: LoadoutFormPreset | null): readonly string[] =>
  preset?.combinedSummary.slice(0, 8) ?? [];

export const LoadoutSelectionApp = (): JSX.Element | null => {
  const { theme } = useGameTheme();
  const { visible, suspended, presets, lockedForms, defaultFormId, commitSelection } =
    useLoadoutSelectionUi();
  const lockedSet = useMemo(() => new Set(lockedForms), [lockedForms]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(defaultFormId);
  const [pending, setPending] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedFormId) ?? null,
    [presets, selectedFormId],
  );

  const overlayStyle = useMemo(
    () =>
      ({
        '--loadout-panel-fill': theme.hud.panelFill,
        '--loadout-panel-line': theme.hud.panelLine,
        '--loadout-text-primary': theme.hud.textPrimary,
        '--loadout-text-secondary': theme.hud.textSecondary,
        '--loadout-accent': theme.accents.combo,
        '--loadout-power': theme.accents.powerUp,
        '--loadout-danger': theme.hud.danger,
      }) as CSSProperties,
    [theme],
  );

  const ballStyle = useMemo(() => {
    const base = selectedPreset ? toHexColor(selectedPreset.preview.baseColor) : '#f4f4f4';
    const accent = selectedPreset ? toHexColor(selectedPreset.preview.accentColor) : '#ffcc66';
    return {
      '--loadout-ball-base': base,
      '--loadout-ball-accent': accent,
    } as CSSProperties;
  }, [selectedPreset]);

  useEffect(() => {
    setSelectedFormId(defaultFormId ?? null);
    setPending(false);
  }, [defaultFormId, presets]);

  useEffect(() => {
    const node = gridRef.current;
    if (!node || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      setShowScrollHint(false);
      return;
    }

    const evaluate = () => {
      setShowScrollHint(node.scrollHeight - node.clientHeight > 8);
    };

    evaluate();
    const observer = new ResizeObserver(evaluate);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [presets]);

  if (!visible || suspended || presets.length === 0 || !commitSelection) {
    return null;
  }

  const combinedSummary = summarize(selectedPreset);
  const startLabel = pending ? 'Starting…' : 'Start';

  const handleStart = async () => {
    if (!selectedPreset || lockedSet.has(selectedPreset.id) || pending) {
      return;
    }
    try {
      setPending(true);
      await commitSelection(selectedPreset.selection);
    } catch (error) {
      console.error('Failed to begin session from loadout selection', error);
      setPending(false);
    }
  };

  return (
    <div className="loadout-overlay" style={overlayStyle}>
      <div className="loadout-backdrop" />
      <div className="loadout-surface ui-interactive">
        <header className="loadout-header">
          <h1>Awaken Mayhaps</h1>
          <p>Shape Mayhaps before the first coin toss</p>
        </header>

        <section className="loadout-preview" aria-label="Selected form">
          <div className="loadout-ball" style={ballStyle}>
            <div className="loadout-ball-core" />
            <div className="loadout-ball-swirl" />
          </div>

          <div className="loadout-preview-details">
            <h2>{selectedPreset?.name ?? 'Select a form to begin'}</h2>
            <p>
              {selectedPreset?.description ??
                'Choose a Mayhaps form to preview its combined effects and bonuses.'}
            </p>
            <dl className="loadout-links">
              <div>
                <dt>Trait</dt>
                <dd>{selectedPreset?.trait.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Sigil</dt>
                <dd>{selectedPreset?.sigil.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Voice</dt>
                <dd>{selectedPreset?.voice.name ?? '—'}</dd>
              </div>
            </dl>
            <div className="loadout-summary" aria-live="polite">
              {combinedSummary.length > 0 ? (
                combinedSummary.map((line, index) => <span key={`summary-${index}`}>{line}</span>)
              ) : (
                <span>Select a form to view combined effects.</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="loadout-start"
            onClick={handleStart}
            disabled={!selectedPreset || lockedSet.has(selectedPreset.id) || pending}
          >
            {startLabel}
          </button>
        </section>

        {showScrollHint && <div className="loadout-scroll-hint">Scroll to browse forms</div>}

        <section className="loadout-grid" ref={gridRef} aria-label="Available forms">
          {presets.map((preset) => {
            const locked = lockedSet.has(preset.id);
            const selected = preset.id === selectedFormId;
            return (
              <button
                key={preset.id}
                type="button"
                className={`loadout-card${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => {
                  if (pending || locked) {
                    return;
                  }
                  setSelectedFormId(preset.id);
                }}
                disabled={pending || locked}
              >
                <span className="loadout-card-title">{preset.name}</span>
                <span className="loadout-card-description">{preset.description}</span>
                <span className="loadout-card-summary">
                  {preset.cardSummary.slice(0, 3).map((line, index) => (
                    <span key={`card-summary-${preset.id}-${index}`}>{line}</span>
                  ))}
                </span>
                {locked && <span className="loadout-card-lock">Locked</span>}
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
};
