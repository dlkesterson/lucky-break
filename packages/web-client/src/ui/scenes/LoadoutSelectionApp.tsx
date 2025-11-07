import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useGameTheme } from '../hooks/useGameTheme';
import { useLoadoutSelectionUi } from '../state/loadout-selection-bridge';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { LoadoutSelectionView } from './LoadoutSelectionView';

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

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
};

const mixColorNumber = (source: number, target: number, amount: number): number => {
  const t = clampUnit(amount);
  const sr = (source >> 16) & 0xff;
  const sg = (source >> 8) & 0xff;
  const sb = source & 0xff;
  const tr = (target >> 16) & 0xff;
  const tg = (target >> 8) & 0xff;
  const tb = target & 0xff;

  const r = Math.round(sr + (tr - sr) * t);
  const g = Math.round(sg + (tg - sg) * t);
  const b = Math.round(sb + (tb - sb) * t);

  return (r << 16) | (g << 8) | b;
};

const mixColorToRgba = (source: number, target: number, amount: number, alpha = 1): string => {
  return rgbaFromNumber(mixColorNumber(source, target, amount), alpha);
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

const D20_CENTER = { x: 50, y: 50 } as const;
const D20_POLYGON_POINTS_SOURCE = createRegularPolygonPoints(20, 48, D20_CENTER);
const D20_POLYGON_POINTS = D20_POLYGON_POINTS_SOURCE.map(
  (point) => `${formatSvgValue(point.x)},${formatSvgValue(point.y)}`,
).join(' ');

const D20_BOUNDS = D20_POLYGON_POINTS_SOURCE.reduce(
  (bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }),
  {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  },
);

const D20_Y_SPAN = Math.max(1, D20_BOUNDS.maxY - D20_BOUNDS.minY);
const D20_X_SPAN = Math.max(1, D20_BOUNDS.maxX - D20_BOUNDS.minX);

const D20_FACE_LAYOUT = D20_POLYGON_POINTS_SOURCE.map((point, index) => {
  const next = D20_POLYGON_POINTS_SOURCE[(index + 1) % D20_POLYGON_POINTS_SOURCE.length];
  const midX = (point.x + next.x + D20_CENTER.x) / 3;
  const midY = (point.y + next.y + D20_CENTER.y) / 3;
  const vertical = clampUnit((midY - D20_BOUNDS.minY) / D20_Y_SPAN);
  const horizontal = clampUnit((midX - D20_BOUNDS.minX) / D20_X_SPAN);
  return {
    id: index,
    points: [
      `${formatSvgValue(point.x)},${formatSvgValue(point.y)}`,
      `${formatSvgValue(next.x)},${formatSvgValue(next.y)}`,
      `${formatSvgValue(D20_CENTER.x)},${formatSvgValue(D20_CENTER.y)}`,
    ].join(' '),
    vertical,
    horizontal,
  } as const;
});

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

/**
 * LoadoutSelectionApp - Container Component
 *
 * Handles:
 * - Game state integration (Zustand store)
 * - Theme provider integration
 * - Stage pointer blocking
 * - Ball color calculations and D20 face rendering
 * - Form selection state management
 * - Scroll hint visibility detection
 *
 * Delegates presentation to LoadoutSelectionView.
 */
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

  const baseColor = selectedPreset?.preview.baseColor ?? 0xf4f4f4;
  const accentColor = selectedPreset?.preview.accentColor ?? 0xffcc66;

  const ballStyle = useMemo(() => {
    const base = toHexColor(baseColor);
    const accent = toHexColor(accentColor);
    const baseGlow = rgbaFromNumber(baseColor, 0.5);
    const shimmer = mixWithWhite(accentColor, 0.35, 0.8);
    const orbitColor = rgbaFromNumber(accentColor, 0.85);
    const orbitTrail = mixWithWhite(accentColor, 0.55, 0.4);
    const accentSoft = rgbaFromNumber(accentColor, 0.16);
    const d20Highlight = mixWithWhite(baseColor, 0.62, 0.85);
    const d20Shadow = mixColorToRgba(baseColor, 0x0c0b1f, 0.55, 0.82);
    const d20Specular = mixWithWhite(accentColor, 0.52, 0.75);
    const d20Edge = mixWithWhite(accentColor, 0.25, 0.82);
    const d20Grid = mixColorToRgba(baseColor, accentColor, 0.28, 0.6);
    const d20Number = mixWithWhite(accentColor, 0.2, 0.9);
    const d20NumberGlow = mixColorToRgba(accentColor, 0xffffff, 0.45, 0.45);
    const d20FacetEdge = mixColorToRgba(baseColor, accentColor, 0.32, 0.5);
    const d20Inner = mixColorToRgba(baseColor, accentColor, 0.22, 0.32);
    return {
      '--loadout-ball-base': base,
      '--loadout-ball-accent': accent,
      '--loadout-ball-glow': baseGlow,
      '--loadout-ball-shimmer': shimmer,
      '--loadout-trait-color': orbitColor,
      '--loadout-trait-trail': orbitTrail,
      '--loadout-trait-soft': accentSoft,
      '--loadout-d20-highlight': d20Highlight,
      '--loadout-d20-shadow': d20Shadow,
      '--loadout-d20-specular': d20Specular,
      '--loadout-d20-edge': d20Edge,
      '--loadout-d20-grid': d20Grid,
      '--loadout-d20-number': d20Number,
      '--loadout-d20-number-glow': d20NumberGlow,
      '--loadout-d20-facet-edge': d20FacetEdge,
      '--loadout-d20-inner': d20Inner,
    } as CSSProperties;
  }, [baseColor, accentColor]);

  const d20Faces = useMemo(() => {
    const accentDepth = mixColorNumber(baseColor, accentColor, 0.28);
    return D20_FACE_LAYOUT.map((face) => {
      const lateralOffset = Math.abs(face.horizontal - 0.5);
      const lightMix = mixColorNumber(baseColor, 0xffffff, 0.55 - face.vertical * 0.25);
      const warmMix = mixColorNumber(baseColor, accentColor, 0.18 + face.vertical * 0.35);
      const depthTarget = mixColorNumber(
        warmMix,
        mixColorNumber(accentDepth, 0x0d0b1c, 0.35 + face.vertical * 0.35 + lateralOffset * 0.2),
        0.6,
      );
      const fill = mixColorNumber(lightMix, depthTarget, 0.58);
      const opacity = 0.72 + (1 - face.vertical) * 0.18;
      return {
        id: face.id,
        points: face.points,
        fill: rgbaFromNumber(fill, 1),
        opacity,
      } as const;
    });
  }, [baseColor, accentColor]);

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

  const handleSelectForm = (formId: string) => {
    if (pending) {
      return;
    }
    setSelectedFormId(formId);
  };

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
    <LoadoutSelectionView
      visible={visible}
      presets={presets}
      selectedFormId={selectedFormId}
      lockedForms={lockedSet}
      pending={pending}
      pulseActive={pulseActive}
      showScrollHint={showScrollHint}
      theme={theme}
      ballStyle={ballStyle}
      d20Faces={d20Faces}
      d20PolygonPoints={D20_POLYGON_POINTS}
      d20FacetLineSegments={D20_FACET_LINE_SEGMENTS}
      onSelectForm={handleSelectForm}
      onStart={handleStart}
      surfaceRef={surfaceRef}
    />
  );
};
