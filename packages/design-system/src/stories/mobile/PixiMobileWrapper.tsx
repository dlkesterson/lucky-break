import { useEffect, useRef } from 'react';
import type { StageHandle } from '@lucky-break/web-client/src/render/stage';

export interface MobileViewportConfig {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  devicePixelRatio?: number;
}

export interface PixiMobileWrapperProps {
  viewport: MobileViewportConfig;
  onSetup: (stage: StageHandle) => void | Promise<void>;
  onUpdate?: (stage: StageHandle, deltaMs: number) => void;
  className?: string;
}

/**
 * Reusable wrapper for rendering Lucky Break's actual PixiJS stage in Storybook
 * with mobile viewport constraints. Uses the real createStage from web-client.
 */
export const PixiMobileWrapper = ({
  viewport,
  onSetup,
  onUpdate,
  className = '',
}: PixiMobileWrapperProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{ stage: StageHandle; lastTime: number } | null>(null);
  const callbacksRef = useRef({ onSetup, onUpdate });

  callbacksRef.current = { onSetup, onUpdate };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let animationHandle: number | null = null;

    const setup = async () => {
      const resolution = viewport.devicePixelRatio ?? window.devicePixelRatio ?? 1;

      // Import createStage dynamically to avoid issues with SSR
      const { createStage } = await import('@lucky-break/web-client/src/render/stage');

      const stage = await createStage({
        parent: container,
        width: viewport.width,
        height: viewport.height,
        resolution,
      });

      if (disposed) {
        stage.destroy();
        return;
      }

      stateRef.current = { stage, lastTime: performance.now() };

      // Call user setup with actual stage
      await callbacksRef.current.onSetup(stage);

      // Start render loop if update callback provided
      if (callbacksRef.current.onUpdate) {
        const tick = (currentTime: number) => {
          if (disposed || !stateRef.current) {
            return;
          }

          const deltaMs = currentTime - stateRef.current.lastTime;
          stateRef.current.lastTime = currentTime;

          callbacksRef.current.onUpdate?.(stateRef.current.stage, deltaMs);

          animationHandle = requestAnimationFrame(tick);
        };

        animationHandle = requestAnimationFrame(tick);
      }
    };

    void setup();

    return () => {
      disposed = true;
      if (animationHandle !== null) {
        cancelAnimationFrame(animationHandle);
      }
      const state = stateRef.current;
      stateRef.current = null;
      if (state) {
        state.stage.destroy();
      }
    };
  }, [viewport.width, viewport.height, viewport.orientation, viewport.devicePixelRatio]);

  const aspectRatio = viewport.width / viewport.height;

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        background: 'linear-gradient(135deg, #0f1729 0%, #02030a 100%)',
        padding: '2rem',
        minHeight: '100vh',
      }}
    >
      <div
        ref={hostRef}
        style={{
          width: '100%',
          maxWidth: viewport.orientation === 'portrait' ? '400px' : '800px',
          aspectRatio: aspectRatio.toString(),
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
        }}
      />
    </div>
  );
};
