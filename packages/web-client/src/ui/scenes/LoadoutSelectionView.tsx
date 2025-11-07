import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Heading, Label, Mono } from '@lucky-break/design-system';
import type { GameThemeDefinition } from 'render/theme';
import type { LoadoutFormPreset as ImportedLoadoutFormPreset } from 'app/runtime/loadouts';

// Re-export for external use
export type LoadoutFormPreset = ImportedLoadoutFormPreset;

export type BallShape = 'sphere' | 'octagon' | 'd20';

export interface LoadoutSelectionViewProps {
  readonly visible: boolean;
  readonly presets: readonly LoadoutFormPreset[];
  readonly selectedFormId: string | null;
  readonly lockedForms: ReadonlySet<string>;
  readonly pending: boolean;
  readonly pulseActive: boolean;
  readonly showScrollHint: boolean;
  readonly theme: GameThemeDefinition;
  readonly ballStyle: CSSProperties;
  readonly d20Faces: readonly {
    readonly id: number;
    readonly points: string;
    readonly fill: string;
    readonly opacity: number;
  }[];
  readonly d20PolygonPoints: string;
  readonly d20FacetLineSegments: readonly {
    readonly id: string;
    readonly x1: string;
    readonly y1: string;
    readonly x2: string;
    readonly y2: string;
  }[];
  readonly onSelectForm: (formId: string) => void;
  readonly onStart: () => void;
  readonly surfaceRef?: React.RefObject<HTMLDivElement>;
}

export const LoadoutSelectionView = ({
  visible,
  presets,
  selectedFormId,
  lockedForms,
  pending,
  pulseActive,
  showScrollHint,
  theme,
  ballStyle,
  d20Faces,
  d20PolygonPoints,
  d20FacetLineSegments,
  onSelectForm,
  onStart,
  surfaceRef,
}: LoadoutSelectionViewProps): JSX.Element | null => {
  const { t } = useTranslation();

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

  if (!visible || presets.length === 0) {
    return null;
  }

  const combinedSummary = selectedPreset?.combinedSummary.slice(0, 8) ?? [];
  const startLabel = pending
    ? t('loadoutSelection.startPending')
    : t('loadoutSelection.startButton');

  return (
    <div className="loadout-overlay" style={overlayStyle}>
      <div className="loadout-backdrop" />
      <div className="loadout-surface ui-interactive" ref={surfaceRef}>
        <header className="loadout-header">
          <Heading>{t('loadoutSelection.title')}</Heading>
          <Label>{t('loadoutSelection.description')}</Label>
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
                <g className="loadout-ball-facet-faces">
                  {d20Faces.map((face) => (
                    <polygon
                      key={`d20-face-${face.id}`}
                      className="loadout-ball-facet-face"
                      points={face.points}
                      fill={face.fill}
                      opacity={face.opacity}
                    />
                  ))}
                </g>
                <polygon className="loadout-ball-facet-hull" points={d20PolygonPoints} />
                {d20FacetLineSegments.map((segment) => (
                  <line
                    key={`d20-line-${segment.id}`}
                    className="loadout-ball-facet-line"
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                  />
                ))}
              </svg>
            )}
            {selectedPreset?.preview.shape === 'd20' && (
              <span className="loadout-ball-d20-number" aria-hidden="true">
                20
              </span>
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
            <Heading className="loadout-preview-title">
              {selectedPreset?.name ?? t('loadoutSelection.preview.emptyTitle')}
            </Heading>
            <Label className="loadout-preview-description">
              {selectedPreset?.description ?? t('loadoutSelection.preview.emptyDescription')}
            </Label>
            <dl className="loadout-links">
              <div>
                <Mono className="loadout-link-label">
                  {t('loadoutSelection.preview.traitLabel')}
                </Mono>
                <Label className="loadout-link-value">
                  {selectedPreset?.trait.name ?? t('loadoutSelection.preview.emptyValue')}
                </Label>
              </div>
              <div>
                <Mono className="loadout-link-label">
                  {t('loadoutSelection.preview.sigilLabel')}
                </Mono>
                <Label className="loadout-link-value">
                  {selectedPreset?.sigil.name ?? t('loadoutSelection.preview.emptyValue')}
                </Label>
              </div>
              <div>
                <Mono className="loadout-link-label">
                  {t('loadoutSelection.preview.voiceLabel')}
                </Mono>
                <Label className="loadout-link-value">
                  {selectedPreset?.voice.name ?? t('loadoutSelection.preview.emptyValue')}
                </Label>
              </div>
            </dl>
            <div className="loadout-summary" aria-live="polite">
              {combinedSummary.length > 0 ? (
                combinedSummary.map((line, index) => (
                  <Label key={`summary-${index}`} className="loadout-summary-line">
                    {line}
                  </Label>
                ))
              ) : (
                <Label>{t('loadoutSelection.preview.summaryEmpty')}</Label>
              )}
            </div>
          </div>

          <button
            type="button"
            className="loadout-start"
            onClick={onStart}
            disabled={!selectedPreset || lockedForms.has(selectedPreset.id) || pending}
          >
            {startLabel}
          </button>
        </section>

        {showScrollHint && (
          <Label className="loadout-scroll-hint">{t('loadoutSelection.scrollHint')}</Label>
        )}
        <section className="loadout-grid" aria-label="Available forms">
          {presets.map((preset) => {
            const locked = lockedForms.has(preset.id);
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
                  onSelectForm(preset.id);
                }}
                disabled={pending || locked}
              >
                <Heading className="loadout-card-title">{preset.name}</Heading>
                <Label className="loadout-card-description">{preset.description}</Label>
                <div className="loadout-card-summary">
                  {preset.cardSummary.slice(0, 3).map((line, index) => (
                    <Mono
                      key={`card-summary-${preset.id}-${index}`}
                      className="loadout-card-summary-line"
                    >
                      {line}
                    </Mono>
                  ))}
                </div>
                {locked && (
                  <Mono className="loadout-card-lock">{t('loadoutSelection.locked')}</Mono>
                )}
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
};
