import { Container } from 'pixi.js';
import type { StageHandle } from 'render/stage';
import type { GameThemeDefinition } from 'render/theme';
import { createHudDisplay, type HudDisplay } from 'render/hud-display';
import { createMobileHudDisplay } from 'render/mobile-hud-display';
import type { EntropyActionType } from 'app/events';
import type { BrickLayoutBounds } from '../../level-runtime';

interface HudLayoutMetrics {
    readonly margin: number;
    readonly maxScale: number;
    readonly minScale: number;
}

export interface RuntimeHudOptions {
    readonly stage: StageHandle;
    readonly theme: GameThemeDefinition;
    readonly hudProfile: 'desktop' | 'mobile';
    readonly playfieldWidth: number;
    readonly metrics: {
        readonly desktop: HudLayoutMetrics;
        readonly mobile: HudLayoutMetrics;
    };
    readonly getBrickLayoutBounds: () => BrickLayoutBounds | null;
    readonly getPaddleSnapshot: () => { readonly centerY: number; readonly height: number };
    readonly onEntropyAction: (action: EntropyActionType) => void;
}

export interface RuntimeHudHandle {
    readonly container: Container;
    readonly display: HudDisplay;
    updateLayout(): void;
    dispose(): void;
}

export const createRuntimeHud = ({
    stage,
    theme,
    hudProfile,
    playfieldWidth,
    metrics,
    getBrickLayoutBounds,
    getPaddleSnapshot,
    onEntropyAction,
}: RuntimeHudOptions): RuntimeHudHandle => {
    const container = new Container();
    container.eventMode = 'none';
    container.visible = false;
    container.zIndex = 1;
    stage.layers.playfield.addChild(container);

    const display = hudProfile === 'mobile'
        ? createMobileHudDisplay(theme)
        : createHudDisplay(theme);
    display.container.zIndex = 1;
    container.addChild(display.container);
    display.setEntropyActionHandler(onEntropyAction);

    const profileMetrics = hudProfile === 'mobile' ? metrics.mobile : metrics.desktop;

    const updateLayout = () => {
        const { margin, maxScale, minScale } = profileMetrics;
        const hudWidth = display.width;
        const hudHeight = display.getHeight();
        const clampScale = (value: number) => Math.max(minScale, Math.min(maxScale, value));

        const { centerY, height: paddleHeight } = getPaddleSnapshot();
        const paddleTop = centerY - paddleHeight / 2;
        const widthScaleLimit = (playfieldWidth - margin * 2) / hudWidth;
        let scale = clampScale(Math.min(maxScale, widthScaleLimit));

        const safePaddleTop = paddleTop - margin;
        let top = Math.max(margin, safePaddleTop - hudHeight * scale);

        const layoutBounds = getBrickLayoutBounds();
        if (layoutBounds) {
            const bricksBottom = layoutBounds.maxY;
            const preferredTop = bricksBottom + margin;
            const availableHeight = safePaddleTop - preferredTop;
            if (availableHeight > 0) {
                const heightScaleLimit = availableHeight / hudHeight;
                scale = clampScale(Math.min(scale, heightScaleLimit));
                const maxTop = safePaddleTop - hudHeight * scale;
                top = Math.max(margin, Math.min(maxTop, preferredTop));
            }
        }

        const width = hudWidth * scale;
        const x = Math.round((playfieldWidth - width) / 2);
        const y = Math.round(Math.max(margin, top));

        display.container.scale.set(scale);
        display.container.position.set(x, y);
    };

    const handleResize = () => {
        updateLayout();
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('resize', handleResize);
    }

    return {
        container,
        display,
        updateLayout,
        dispose: () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('resize', handleResize);
            }
            if (container.parent) {
                container.parent.removeChild(container);
            }
        },
    };
};
