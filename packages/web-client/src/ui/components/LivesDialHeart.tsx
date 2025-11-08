import type { CSSProperties } from 'react';

export interface LivesDialHeartProps {
  readonly value: number;
  readonly max?: number;
  readonly size?: number;
  readonly fillColor?: string;
  readonly emptyColor?: string;
  readonly rimColor?: string;
  readonly textColor?: string;
  readonly glow?: boolean;
}

const HEART_PATH =
  'M0,-0.3 C0,-0.55 -0.25,-0.8 -0.55,-0.8 C-0.85,-0.8 -1.0,-0.5 -1.0,-0.2 C-1.0,0.2 -0.6,0.6 0,1.0 C0.6,0.6 1.0,0.2 1.0,-0.2 C1.0,-0.5 0.85,-0.8 0.55,-0.8 C0.25,-0.8 0,-0.55 0,-0.3 Z';

export const LivesDialHeart = ({
  value,
  max = 3,
  size = 80,
  fillColor = '#FFD43B',
  emptyColor = '#2B2E3A',
  rimColor = '#C9CED6',
  textColor = '#101218',
  glow = true,
}: LivesDialHeartProps): JSX.Element => {
  const ratio = Math.max(0, Math.min(1, value / max));

  const s = size;

  const style: CSSProperties = {
    display: 'block',
  };

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <defs>
        <clipPath id="heartClip" clipPathUnits="objectBoundingBox">
          <path d={HEART_PATH} transform="scale(0.5) translate(1,1)" />
        </clipPath>

        {glow && (
          <filter id="softGlowHeart" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Rim */}
      <circle cx="50" cy="50" r="49" fill={rimColor} />
      <circle cx="50" cy="50" r="44" fill="#0E1016" />

      {/* Heart background (empty) */}
      <g transform="translate(50 50) scale(40)" clipPath="url(#heartClip)">
        <rect x="-1" y="-1" width="2" height="2" fill={emptyColor} />
        {/* Active fill (pie wedge style) */}
        <rect
          x="-1"
          y={1 - ratio * 2}
          width="2"
          height={ratio * 2}
          fill={fillColor}
          filter={glow ? 'url(#softGlowHeart)' : undefined}
        />
      </g>

      {/* Center label */}
      <text
        x="50"
        y="57"
        textAnchor="middle"
        fontFamily="'Overpass', sans-serif"
        fontWeight={800}
        fontSize="36"
        fill={textColor}
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 2 }}
      >
        {Math.ceil(value)}
      </text>
    </svg>
  );
};
