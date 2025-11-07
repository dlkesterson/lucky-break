import { useEffect, useRef } from 'react';

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

export const RouletteWheel = ({ accentColor }: { readonly accentColor: string }) => {
  const diskRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let angle = 0;
    let lastTimestamp: number | null = null;
    const tick = (timestamp: number) => {
      if (lastTimestamp !== null) {
        const delta = timestamp - lastTimestamp;
        angle = (angle + delta * 0.00012) % 360;
        if (angle < 0) {
          angle += 360;
        }
      }
      lastTimestamp = timestamp;
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
