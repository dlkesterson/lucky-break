---

### 💛 `LivesDialHeart.tsx`

```tsx
import React from "react";

type LivesDialHeartProps = {
  value: number; // current lives
  max?: number; // total hearts
  size?: number;
  fillColor?: string;
  emptyColor?: string;
  rimColor?: string;
  textColor?: string;
  glow?: boolean;
};

/** Heart path centered at 0,0 (unit size) */
const HEART_PATH =
  "M0,-0.3 C0,-0.55 -0.25,-0.8 -0.55,-0.8 C-0.85,-0.8 -1.0,-0.5 -1.0,-0.2 C-1.0,0.2 -0.6,0.6 0,1.0 C0.6,0.6 1.0,0.2 1.0,-0.2 C1.0,-0.5 0.85,-0.8 0.55,-0.8 C0.25,-0.8 0,-0.55 0,-0.3 Z";

export const LivesDialHeart: React.FC<LivesDialHeartProps> = ({
  value,
  max = 3,
  size = 80,
  fillColor = "#FFD43B",
  emptyColor = "#2B2E3A",
  rimColor = "#C9CED6",
  textColor = "#101218",
  glow = true,
}) => {
  const ratio = Math.max(0, Math.min(1, value / max));

  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
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
          filter={glow ? "url(#softGlowHeart)" : undefined}
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
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}
      >
        {Math.ceil(value)}
      </text>
    </svg>
  );
};
```

---

### 🎮 Integrate with your HUD

Replace the old `LivesDial` import:

```tsx
import { LivesDialHeart } from "./LivesDialHeart";

<div className="hud-bottom-right">
  <LivesDialHeart value={lives} max={3} size={72} />
</div>
```

---

### 💡 Notes & Tweaks

* The heart is filled **vertically**, like a rising energy bar inside the shape.
  If you prefer a **radial wedge** (pie-slice) inside the heart, I can adjust it to use a gradient mask instead.
* You can add a **red glow pulse** when `lives <= 1` using CSS or conditional filter intensity.
* For multiple hearts (e.g., 3 hearts each fully/partially filled), we can render a **`<HeartsRow>`** component that repeats this SVG side by side and shows partial fill in the last one.

