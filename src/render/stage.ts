import { Container, FillGradient, Graphics } from 'pixi.js';
import { createSceneManager, type SceneManagerConfig, type SceneManagerHandle, type StageLayers } from './scene-manager';
import { GameTheme, type GameThemeDefinition } from './theme';

export type StageConfig = SceneManagerConfig;

export interface ThemedStageConfig extends StageConfig {
    readonly theme?: GameThemeDefinition;
}

type EasingFn = (value: number) => number;

const clamp01 = (value: number): number => {
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

const easeInOutSine: EasingFn = (value) => {
    const t = clamp01(value);
    return -(Math.cos(Math.PI * t) - 1) / 2;
};

const DEFAULT_FADE_DURATION = 0.35;
const DEFAULT_TRANSITION_COLOR = 0x000000;
const DEFAULT_TARGET_ALPHA = 1;
const MAX_TRANSITION_DELTA = 0.25;

const resolveRequestFrame = (): ((callback: (time: number) => void) => number) => {
    const globalRef = globalThis as typeof globalThis & {
        requestAnimationFrame?: (callback: (time: number) => void) => number;
        setTimeout?: (handler: () => void, timeout?: number) => number;
        performance?: { now?: () => number };
    };

    if (typeof globalRef.requestAnimationFrame === 'function') {
        return (callback) => globalRef.requestAnimationFrame(callback);
    }

    if (typeof globalRef.setTimeout === 'function') {
        return (callback) => {
            const now = typeof globalRef.performance?.now === 'function'
                ? () => globalRef.performance!.now()
                : () => Date.now();
            return Number(globalRef.setTimeout(() => callback(now()), 16));
        };
    }

    return () => 0;
};

const resolveCancelFrame = (): ((handle: number) => void) => {
    const globalRef = globalThis as typeof globalThis & {
        cancelAnimationFrame?: (handle: number) => void;
        clearTimeout?: (handle: number) => void;
    };

    if (typeof globalRef.cancelAnimationFrame === 'function') {
        return (handle) => globalRef.cancelAnimationFrame(handle);
    }

    if (typeof globalRef.clearTimeout === 'function') {
        return (handle) => globalRef.clearTimeout(handle);
    }

    return () => { };
};

const requestFrame = resolveRequestFrame();
const cancelFrame = resolveCancelFrame();

export interface StageTransitionOptions {
    readonly color?: number;
    readonly targetAlpha?: number;
    readonly duration?: number;
    readonly fadeOutDuration?: number;
    readonly fadeInDuration?: number;
    readonly easing?: EasingFn;
    readonly fadeOutEasing?: EasingFn;
    readonly fadeInEasing?: EasingFn;
    readonly skipFadeOut?: boolean;
    readonly skipFadeIn?: boolean;
    readonly immediate?: boolean;
}

export interface StageHandle extends SceneManagerHandle {
    readonly backgroundLayer: Container;
    readonly backgroundGraphic: Graphics;
    readonly theme: GameThemeDefinition;
    applyTheme(theme: GameThemeDefinition): void;
    transitionTo<TPayload = unknown>(name: string, payload?: TPayload, options?: StageTransitionOptions): Promise<void>;
    isTransitionActive(): boolean;
    toPlayfield(point: { readonly x: number; readonly y: number }): { x: number; y: number };
    toCanvas(point: { readonly x: number; readonly y: number }): { x: number; y: number };
}

type TransitionPhase = 'fade-out' | 'waiting-switch' | 'fade-in';

interface ActiveTransition {
    phase: TransitionPhase;
    elapsed: number;
    durationOut: number;
    durationIn: number;
    targetAlpha: number;
    skipOut: boolean;
    skipIn: boolean;
    easingOut: EasingFn;
    easingIn: EasingFn;
    resolve: () => void;
    reject: (error: unknown) => void;
    targetScene: { name: string; payload: unknown };
    switchPromise: Promise<void> | null;
}

const paintBackground = (
    target: Graphics,
    theme: GameThemeDefinition,
    dimensions: { readonly width: number; readonly height: number },
) => {
    const { width, height } = dimensions;
    target.clear();
    const gradient = new FillGradient(0, 0, 0, height);
    gradient.addColorStop(0, theme.background.from);
    gradient.addColorStop(1, theme.background.to);

    target.rect(0, 0, width, height);
    target.fill(gradient);
};

export const createStage = async (config: ThemedStageConfig = {}): Promise<StageHandle> => {
    const { theme: requestedTheme = GameTheme, ...sceneConfig } = config;
    const baseHandle = await createSceneManager(sceneConfig);

    const backgroundLayer = new Container();
    backgroundLayer.label = 'background';
    backgroundLayer.zIndex = 0;
    backgroundLayer.eventMode = 'none';

    const backgroundGraphic = new Graphics();
    backgroundGraphic.eventMode = 'none';
    backgroundGraphic.zIndex = 0;

    backgroundLayer.addChild(backgroundGraphic);

    const root = baseHandle.layers.root;
    // Ensure background renders behind the standard layers
    root.addChildAt(backgroundLayer, 0);

    const transitionOverlay = new Graphics();
    transitionOverlay.eventMode = 'none';
    transitionOverlay.visible = false;
    transitionOverlay.alpha = 0;
    transitionOverlay.zIndex = 10000;
    root.addChild(transitionOverlay);

    let activeTheme = requestedTheme;
    const redrawBackground = () => {
        paintBackground(backgroundGraphic, activeTheme, baseHandle.designSize);
    };
    redrawBackground();

    let overlayColor = DEFAULT_TRANSITION_COLOR;
    const paintTransitionOverlay = (color: number) => {
        overlayColor = color;
        const { width, height } = baseHandle.designSize;
        transitionOverlay.clear();
        transitionOverlay.rect(0, 0, width, height);
        transitionOverlay.fill({ color });
    };
    paintTransitionOverlay(overlayColor);

    let activeTransition: ActiveTransition | null = null;
    let transitionQueue: Promise<void> = Promise.resolve();
    let transitionRafHandle: number | null = null;
    let lastTransitionTimestamp = 0;

    const stopTransitionTicker = () => {
        if (transitionRafHandle !== null) {
            cancelFrame(transitionRafHandle);
            transitionRafHandle = null;
        }
        lastTransitionTimestamp = 0;
    };

    const clearOverlay = () => {
        transitionOverlay.visible = false;
        transitionOverlay.alpha = 0;
    };

    const completeTransition = () => {
        if (!activeTransition) {
            return;
        }
        const resolver = activeTransition.resolve;
        activeTransition = null;
        clearOverlay();
        stopTransitionTicker();
        resolver();
    };

    const failTransition = (cause: unknown) => {
        if (!activeTransition) {
            return;
        }
        const rejecter = activeTransition.reject;
        activeTransition = null;
        clearOverlay();
        stopTransitionTicker();
        rejecter(cause instanceof Error ? cause : new Error(String(cause)));
    };

    const startSwitch = () => {
        if (!activeTransition || activeTransition.switchPromise) {
            return;
        }

        activeTransition.phase = 'waiting-switch';
        activeTransition.elapsed = 0;
        transitionOverlay.alpha = activeTransition.targetAlpha;

        const { name, payload } = activeTransition.targetScene;
        const switchPromise = Promise.resolve(baseHandle.switch(name, payload));
        activeTransition.switchPromise = switchPromise;

        switchPromise
            .then(() => {
                if (!activeTransition) {
                    return;
                }
                if (activeTransition.skipIn) {
                    completeTransition();
                    return;
                }
                activeTransition.phase = 'fade-in';
                activeTransition.elapsed = 0;
            })
            .catch((error) => {
                failTransition(error);
            });
    };

    const advanceTransition = (deltaSeconds: number) => {
        if (!activeTransition) {
            return;
        }

        if (activeTransition.phase === 'fade-out') {
            if (activeTransition.durationOut <= 0) {
                startSwitch();
                return;
            }

            activeTransition.elapsed += deltaSeconds;
            const progress = clamp01(activeTransition.elapsed / activeTransition.durationOut);
            const alpha = activeTransition.easingOut(progress) * activeTransition.targetAlpha;
            transitionOverlay.alpha = alpha;
            if (progress >= 1) {
                startSwitch();
            }
            return;
        }

        if (activeTransition.phase === 'fade-in') {
            if (activeTransition.durationIn <= 0) {
                completeTransition();
                return;
            }

            activeTransition.elapsed += deltaSeconds;
            const progress = clamp01(activeTransition.elapsed / activeTransition.durationIn);
            const alpha = (1 - activeTransition.easingIn(progress)) * activeTransition.targetAlpha;
            transitionOverlay.alpha = alpha;
            if (progress >= 1) {
                completeTransition();
            }
            return;
        }

        transitionOverlay.alpha = activeTransition.targetAlpha;
    };

    const stepTransition = (timestamp: number) => {
        if (!activeTransition) {
            transitionRafHandle = null;
            return;
        }

        if (lastTransitionTimestamp === 0) {
            lastTransitionTimestamp = timestamp;
        }

        const deltaMs = Math.max(0, timestamp - lastTransitionTimestamp);
        lastTransitionTimestamp = timestamp;
        const deltaSeconds = Math.min(MAX_TRANSITION_DELTA, deltaMs / 1000);
        advanceTransition(deltaSeconds);

        if (activeTransition) {
            transitionRafHandle = requestFrame(stepTransition);
        } else {
            transitionRafHandle = null;
        }
    };

    const ensureTransitionTicker = () => {
        if (transitionRafHandle !== null) {
            return;
        }
        lastTransitionTimestamp = 0;
        transitionRafHandle = requestFrame(stepTransition);
    };

    const runTransition = <TPayload,>(
        name: string,
        payload: TPayload | undefined,
        options: StageTransitionOptions | undefined,
    ): Promise<void> => {
        if (options?.immediate) {
            return baseHandle.switch(name, payload);
        }

        const baseDuration = options?.duration ?? DEFAULT_FADE_DURATION;
        const fadeOutDuration = options?.fadeOutDuration ?? baseDuration;
        const fadeInDuration = options?.fadeInDuration ?? baseDuration;
        const skipOut = options?.skipFadeOut ?? fadeOutDuration <= 0;
        const skipIn = options?.skipFadeIn ?? fadeInDuration <= 0;
        const targetAlpha = clamp01(options?.targetAlpha ?? DEFAULT_TARGET_ALPHA);
        const easingBase = options?.easing ?? easeInOutSine;
        const easingOut = options?.fadeOutEasing ?? easingBase;
        const easingIn = options?.fadeInEasing ?? easingBase;
        const color = options?.color ?? overlayColor;

        return new Promise<void>((resolve, reject) => {
            activeTransition = {
                phase: skipOut ? 'waiting-switch' : 'fade-out',
                elapsed: 0,
                durationOut: Math.max(0, fadeOutDuration),
                durationIn: Math.max(0, fadeInDuration),
                targetAlpha,
                skipOut,
                skipIn,
                easingOut,
                easingIn,
                resolve,
                reject,
                targetScene: { name, payload: payload as unknown },
                switchPromise: null,
            };

            paintTransitionOverlay(color);
            transitionOverlay.visible = true;
            transitionOverlay.alpha = skipOut ? targetAlpha : 0;

            ensureTransitionTicker();

            if (skipOut) {
                startSwitch();
            }
        });
    };

    const transitionTo = <TPayload,>(
        name: string,
        payload?: TPayload,
        options?: StageTransitionOptions,
    ): Promise<void> => {
        const ready = transitionQueue.catch(() => undefined);
        const next = ready.then(() => runTransition(name, payload, options));
        transitionQueue = next.catch(() => undefined);
        return next;
    };

    const applyTheme = (nextTheme: GameThemeDefinition) => {
        activeTheme = nextTheme;
        redrawBackground();
    };

    const baseUpdate = baseHandle.update.bind(baseHandle);
    const baseResize = baseHandle.resize.bind(baseHandle);
    const baseDestroy = baseHandle.destroy.bind(baseHandle);

    const getResolution = () => {
        const renderer = baseHandle.app.renderer as { resolution?: number };
        return renderer.resolution ?? 1;
    };

    const toPlayfield = (point: { readonly x: number; readonly y: number }) => {
        const rootContainer = baseHandle.layers.root;
        const scaleX = rootContainer.scale.x !== 0 ? rootContainer.scale.x : 1;
        const scaleY = rootContainer.scale.y !== 0 ? rootContainer.scale.y : 1;
        const resolution = getResolution();

        return {
            x: (point.x / resolution - rootContainer.position.x) / scaleX,
            y: (point.y / resolution - rootContainer.position.y) / scaleY,
        };
    };

    const toCanvas = (point: { readonly x: number; readonly y: number }) => {
        const rootContainer = baseHandle.layers.root;
        const scaleX = rootContainer.scale.x !== 0 ? rootContainer.scale.x : 1;
        const scaleY = rootContainer.scale.y !== 0 ? rootContainer.scale.y : 1;
        const resolution = getResolution();

        return {
            x: (point.x * scaleX + rootContainer.position.x) * resolution,
            y: (point.y * scaleY + rootContainer.position.y) * resolution,
        };
    };

    const themedHandle: StageHandle = {
        ...baseHandle,
        backgroundLayer,
        backgroundGraphic,
        toPlayfield,
        toCanvas,
        applyTheme,
        transitionTo,
        isTransitionActive: () => activeTransition !== null,
        update: (deltaSeconds: number) => {
            baseUpdate(deltaSeconds);
        },
        resize: (size) => {
            baseResize(size);
            redrawBackground();
            paintTransitionOverlay(overlayColor);
        },
        destroy: () => {
            if (activeTransition) {
                failTransition(new Error('Stage destroyed during transition'));
            }
            stopTransitionTicker();
            transitionOverlay.destroy();
            baseDestroy();
        },
        get theme() {
            return activeTheme;
        },
    };

    return themedHandle;
};

export type { StageLayers };
