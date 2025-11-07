import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameTheme } from '../hooks/useGameTheme';
import { useLoadoutSelectionUi } from '../state/loadout-selection-bridge';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import type { LoadoutFormPreset } from 'app/runtime/loadouts';

const toHexColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const toRgbComponents = (value: number): readonly [number, number, number] => [
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
];

const rgbaFromNumber = (value: number, alpha = 1): string => {
  const [r, g, b] = toRgbComponents(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mixWithWhite = (value: number, ratio: number, alpha = 1): string => {
  const [r, g, b] = toRgbComponents(value);
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const mix = (component: number) => Math.round(component + (255 - component) * clamped);
  return `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})`;
};

const formatSvgValue = (value: number): string => value.toFixed(2);

const createRegularPolygonPoints = (
  sides: number,
  radius: number,
  center: { readonly x: number; readonly y: number },
  rotation = -Math.PI / 2,
): readonly { readonly x: number; readonly y: number }[] => {
  if (sides < 3) {
    return [];
  }
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * Math.PI * 2) / sides;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
};

const D20_POLYGON_POINTS_SOURCE = createRegularPolygonPoints(20, 48, { x: 50, y: 50 });
const D20_POLYGON_POINTS = D20_POLYGON_POINTS_SOURCE.map(
  (point) => `${formatSvgValue(point.x)},${formatSvgValue(point.y)}`,
).join(' ');

const D20_FACET_LINE_INDICES: readonly [number, number][] = [
  [0, 10],
  [2, 12],
  [4, 14],
  [6, 16],
  [8, 18],
  [1, 6],
  [3, 8],
  [5, 10],
  [7, 12],
  [9, 14],
  [11, 16],
  [13, 18],
  [15, 0],
  [17, 2],
  [19, 4],
  [0, 5],
  [5, 15],
  [10, 15],
  [10, 0],
  [2, 7],
  [7, 17],
  [12, 17],
  [12, 2],
];

const D20_FACET_LINE_SEGMENTS = D20_FACET_LINE_INDICES.map(([startIndex, endIndex]) => {
  const start = D20_POLYGON_POINTS_SOURCE[startIndex % D20_POLYGON_POINTS_SOURCE.length];
  const end = D20_POLYGON_POINTS_SOURCE[endIndex % D20_POLYGON_POINTS_SOURCE.length];
  return {
    id: `${startIndex}-${endIndex}`,
    x1: formatSvgValue(start.x),
    y1: formatSvgValue(start.y),
    x2: formatSvgValue(end.x),
    y2: formatSvgValue(end.y),
  } as const;
});

const summarize = (preset: LoadoutFormPreset | null): readonly string[] =>
  preset?.combinedSummary.slice(0, 8) ?? [];

export const LoadoutSelectionApp = (): JSX.Element | null => {
  const { theme } = useGameTheme();
  const { visible, suspended, presets, lockedForms, defaultFormId, commitSelection } =
    useLoadoutSelectionUi();
  const lockedSet = useMemo(() => new Set(lockedForms), [lockedForms]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(defaultFormId);
  const [pending, setPending] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const resolveDocument = useCallback(() => surfaceRef.current?.ownerDocument ?? null, []);

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
    const baseGlow = selectedPreset
      ? rgbaFromNumber(selectedPreset.preview.baseColor, 0.5)
      : 'rgba(244, 244, 244, 0.5)';
    const shimmer = selectedPreset
      ? mixWithWhite(selectedPreset.preview.accentColor, 0.35, 0.8)
      : 'rgba(255, 236, 200, 0.8)';
    const orbitColor = selectedPreset
      ? rgbaFromNumber(selectedPreset.preview.accentColor, 0.85)
      : 'rgba(255, 204, 102, 0.85)';
    const orbitTrail = selectedPreset
      ? mixWithWhite(selectedPreset.preview.accentColor, 0.55, 0.4)
      : 'rgba(255, 229, 180, 0.4)';
    const accentSoft = selectedPreset
      ? rgbaFromNumber(selectedPreset.preview.accentColor, 0.16)
      : 'rgba(255, 204, 102, 0.16)';
    return {
      '--loadout-ball-base': base,
      '--loadout-ball-accent': accent,
      '--loadout-ball-glow': baseGlow,
      '--loadout-ball-shimmer': shimmer,
      '--loadout-trait-color': orbitColor,
      '--loadout-trait-trail': orbitTrail,
      '--loadout-trait-soft': accentSoft,
    } as CSSProperties;
  }, [selectedPreset]);

  useEffect(() => {
    setSelectedFormId(defaultFormId ?? null);
    setPending(false);
  }, [defaultFormId, presets]);

  useEffect(() => {
    if (!selectedPreset || typeof window === 'undefined') {
      return;
    }
    setPulseActive(true);
    const timeout = window.setTimeout(() => {
      setPulseActive(false);
    }, 720);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [selectedPreset?.id]);

  useEffect(() => {
    const node = surfaceRef.current;
    if (
      !visible ||
      suspended ||
      !node ||
      typeof window === 'undefined' ||
      typeof ResizeObserver === 'undefined'
    ) {
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
  }, [visible, suspended, presets]);

  useStagePointerBlocker(visible && !suspended, resolveDocument);

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
      <div className="loadout-surface ui-interactive" ref={surfaceRef}>
        <header className="loadout-header">
          <h1>Choose Your Ball</h1>
          <p>Shape Mayhaps before the first coin toss</p>
        </header>

        <section className="loadout-preview" aria-label="Selected form">
          <div
            className={`loadout-ball${pulseActive ? ' is-pulsing' : ''}${pending ? ' is-pending' : ''}`}
            style={ballStyle}
            data-shape={selectedPreset?.preview.shape ?? 'sphere'}
          >
            <div className="loadout-ball-glow" />
            <div className="loadout-ball-core" />
            <div className="loadout-ball-swirl" />
            {selectedPreset?.preview.shape === 'octagon' && (
              <span className="loadout-ball-stop-label" aria-hidden="true">
                STOP
              </span>
            )}
            {selectedPreset?.preview.shape === 'd20' && (
              <svg
                className="loadout-ball-facet-svg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <polygon points={D20_POLYGON_POINTS} />
                {D20_FACET_LINE_SEGMENTS.map((segment) => (
                  <line
                    key={`d20-line-${segment.id}`}
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                  />
                ))}
              </svg>
            )}
            <div className="loadout-ball-orbit" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={`orbit-glyph-${index}`}
                  data-orbit-layer={index}
                  style={{ '--orbit-index': index } as CSSProperties}
                />
              ))}
            </div>
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
        <section className="loadout-grid" aria-label="Available forms">
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
