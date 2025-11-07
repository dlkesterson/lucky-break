import { cn } from '@lucky-break/design-system';
import type { BiasPhaseSceneOption } from 'scenes/bias-phase';

const riskLabel: Record<BiasPhaseSceneOption['risk'], string> = {
  tilt: 'Tilt',
  lock: 'Lock',
  reforge: 'Reforge',
};

export interface OptionCardProps {
  readonly option: BiasPhaseSceneOption;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly locked: boolean;
  readonly onSelect: (optionId: string) => void;
}

export const OptionCard = ({ option, selected, disabled, locked, onSelect }: OptionCardProps) => (
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
