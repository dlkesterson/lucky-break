import { Application, Container, Sprite } from 'pixi.js';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_BACKGROUND = 0x000000;

export type SceneLayerName = 'playfield' | 'effects' | 'hud';

interface SpritePool<T> {
    acquire: (this: void) => T;
    release: (this: void, value: T) => void;
    clear: (this: void) => void;
}

type ResizableRenderer = Application['renderer'] & {
    resize: (...args: unknown[]) => void;
};

const hasResize = (renderer: Application['renderer']): renderer is ResizableRenderer => {
    const candidate = renderer as { resize?: unknown };
    return typeof candidate?.resize === 'function';
};

const createSpritePool = <T>(factory: () => T): SpritePool<T> => {
    const free: T[] = [];

    const acquire = () => free.pop() ?? factory();
    const release = (value: T) => {
        free.push(value);
    };
    const clear = () => {
        free.length = 0;
    };

    return { acquire, release, clear };
};

const resizeRenderer = (app: Application, width: number, height: number): void => {
    const renderer = app.renderer;

    if (!hasResize(renderer)) {
        return;
    }

    if (renderer.resize.length <= 1) {
        renderer.resize({ width, height });
        return;
    }

    renderer.resize(width, height);
};

export interface StageConfig {
    readonly view?: HTMLCanvasElement;
    readonly parent?: HTMLElement;
    readonly width?: number;
    readonly height?: number;
    readonly background?: number;
    readonly resolution?: number;
}

export interface StageLayers {
    readonly root: Container;
    readonly playfield: Container;
    readonly effects: Container;
    readonly hud: Container;
}

export interface SceneDimensions {
    readonly width: number;
    readonly height: number;
}

export interface SceneRuntimeContext {
    readonly app: Application;
    readonly layers: StageLayers;
    readonly addToLayer: (layer: SceneLayerName, container: Container) => void;
    readonly removeFromLayer: (container: Container) => void;
    readonly acquireSprite: () => Sprite;
    readonly releaseSprite: (sprite: Sprite) => void;
    readonly switchScene: <TPayload = unknown>(name: string, payload?: TPayload) => Promise<void>;
    readonly pushScene: <TPayload = unknown>(name: string, payload?: TPayload) => Promise<void>;
    readonly popScene: () => void;
    readonly transitionScene: <TPayload = unknown>(name: string, payload?: TPayload, options?: SceneTransitionOptions) => Promise<void>;
    readonly designSize: SceneDimensions;
}

export type SceneContext<TServices extends object = Record<string, never>> = SceneRuntimeContext & TServices;

export interface Scene<TPayload = unknown, TServices extends object = Record<string, never>> {
    init(payload?: TPayload): void | Promise<void>;
    update(deltaSeconds: number): void;
    destroy(): void;
    suspend?(): void;
    resume?(): void;
    /**
     * Internal type-brand used to associate the scene with its contextual services.
     * Scenes do not need to implement this field.
     */
    readonly __contextBrand?: (services: SceneContext<TServices>) => void;
}

export type SceneFactory<
    TPayload = unknown,
    TServices extends object = Record<string, never>,
> = (context: SceneContext<TServices>) => Scene<TPayload, TServices>;

type SceneContextProvider<TServices extends object> = (runtime: SceneRuntimeContext) => TServices;

export interface SceneRegistrationOptions<TServices extends object = Record<string, never>> {
    readonly provideContext?: SceneContextProvider<TServices>;
}

interface SceneRegistration<TPayload, TServices extends object> {
    readonly factory: SceneFactory<TPayload, TServices>;
    readonly provideContext?: SceneContextProvider<TServices>;
}

export interface SceneManagerHandle {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly layers: StageLayers;
    readonly acquireSprite: () => Sprite;
    readonly releaseSprite: (sprite: Sprite) => void;
    readonly addToLayer: (layer: SceneLayerName, container: Container) => void;
    readonly removeFromLayer: (container: Container) => void;
    readonly resize: (size: { readonly width: number; readonly height: number }) => void;
    readonly designSize: SceneDimensions;
    register<TPayload = unknown, TServices extends object = Record<string, never>>(
        name: string,
        factory: SceneFactory<TPayload, TServices>,
        options?: SceneRegistrationOptions<TServices>,
    ): void;
    switch<TPayload = unknown>(name: string, payload?: TPayload): Promise<void>;
    transition<TPayload = unknown>(name: string, payload?: TPayload, options?: SceneTransitionOptions): Promise<void>;
    push<TPayload = unknown>(name: string, payload?: TPayload): Promise<void>;
    pop(): void;
    update(deltaSeconds: number): void;
    getCurrentScene(): string | null;
    destroy(): void;
}

export type SceneTransitionEffect = 'fade' | 'slide';
export type SceneTransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface SceneTransitionOptions {
    readonly effect?: SceneTransitionEffect;
    readonly durationMs?: number;
    readonly easing?: (progress: number) => number;
    readonly direction?: SceneTransitionDirection;
}

const DEFAULT_TRANSITION_DURATION_MS = 250;
const DEFAULT_TRANSITION_EFFECT: SceneTransitionEffect = 'fade';
const DEFAULT_SLIDE_DIRECTION: SceneTransitionDirection = 'right';

const defaultEase = (progress: number) => progress;

interface SlideVectors {
    readonly startIncoming: { readonly x: number; readonly y: number };
    readonly endOutgoing: { readonly x: number; readonly y: number };
}

const isTextureRenderer = (
    renderer: Application['renderer'],
): renderer is Application['renderer'] & { generateTexture: (displayObject: Container) => unknown } => {
    const candidate = renderer as { generateTexture?: unknown };
    return typeof candidate?.generateTexture === 'function';
};

const resolveResolution = (config: StageConfig): number => {
    if (config.resolution) {
        return config.resolution;
    }

    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
        return window.devicePixelRatio;
    }

    return 1;
};

const resolveSlideVectors = (
    direction: SceneTransitionDirection,
    width: number,
    height: number,
): SlideVectors => {
    switch (direction) {
        case 'left':
            return {
                startIncoming: { x: -width, y: 0 },
                endOutgoing: { x: width, y: 0 },
            };
        case 'right':
            return {
                startIncoming: { x: width, y: 0 },
                endOutgoing: { x: -width, y: 0 },
            };
        case 'up':
            return {
                startIncoming: { x: 0, y: -height },
                endOutgoing: { x: 0, y: height },
            };
        case 'down':
        default:
            return {
                startIncoming: { x: 0, y: height },
                endOutgoing: { x: 0, y: -height },
            };
    }
};
export type SceneManagerConfig = StageConfig;

export const createSceneManager = async (config: SceneManagerConfig = {}): Promise<SceneManagerHandle> => {
    const width = config.width ?? DEFAULT_WIDTH;
    const height = config.height ?? DEFAULT_HEIGHT;
    const resolution = resolveResolution(config);
    const designSize: SceneDimensions = { width, height };

    const app = new Application();
    await app.init({
        width,
        height,
        canvas: config.view,
        resolution,
        antialias: true,
    });

    if (config.background !== undefined) {
        app.renderer.background.color = config.background;
    } else {
        app.renderer.background.color = DEFAULT_BACKGROUND;
    }

    const canvas = app.canvas;
    let detachOnDestroy = false;

    if (config.parent) {
        const alreadyAttached = canvas.parentElement === config.parent;
        if (!alreadyAttached) {
            config.parent.appendChild(canvas);
            detachOnDestroy = true;
        }
    }

    const root = app.stage;
    root.sortableChildren = true;

    const playfield = new Container();
    playfield.label = 'playfield';
    playfield.zIndex = 10;

    const effects = new Container();
    effects.label = 'effects';
    effects.zIndex = 20;

    const hud = new Container();
    hud.label = 'hud';
    hud.zIndex = 30;

    root.addChild(playfield, effects, hud);

    const layers: StageLayers = {
        root,
        playfield,
        effects,
        hud,
    };

    const spritePool = createSpritePool(() => new Sprite());

    const addToLayer = (layerName: SceneLayerName, container: Container) => {
        const layer = layers[layerName];
        if (!layer) {
            throw new Error(`Unknown layer: ${layerName}`);
        }
        if (!layer.children.includes(container)) {
            layer.addChild(container);
        }
    };

    const removeFromLayer = (container: Container) => {
        const parent = container.parent;
        if (parent) {
            parent.removeChild(container);
        }
    };

    const acquireSprite = () => {
        const sprite = spritePool.acquire();
        sprite.visible = true;
        sprite.alpha = 1;
        return sprite;
    };

    const releaseSprite = (sprite: Sprite) => {
        removeFromLayer(sprite);
        sprite.visible = false;
        sprite.alpha = 1;
        spritePool.release(sprite);
    };

    const resize = (size: { readonly width: number; readonly height: number }) => {
        resizeRenderer(app, size.width, size.height);
    };

    type UnknownServices = Record<string, unknown>;
    const sceneRegistrations = new Map<string, SceneRegistration<unknown, UnknownServices>>();
    const sceneStack: { readonly name: string; readonly scene: Scene<unknown, UnknownServices> }[] = [];
    let destroyed = false;
    interface FadeTransitionState {
        readonly kind: 'fade';
        readonly sprite: Sprite;
        readonly durationSeconds: number;
        elapsedSeconds: number;
        readonly resolve: () => void;
        readonly reject: (error: unknown) => void;
        readonly easing: (progress: number) => number;
    }

    interface SlideTransitionState {
        readonly kind: 'slide';
        readonly outgoing: Sprite;
        readonly incoming: Sprite;
        readonly direction: SceneTransitionDirection;
        readonly durationSeconds: number;
        elapsedSeconds: number;
        readonly resolve: () => void;
        readonly reject: (error: unknown) => void;
        readonly easing: (progress: number) => number;
        readonly startIncoming: { readonly x: number; readonly y: number };
        readonly endOutgoing: { readonly x: number; readonly y: number };
        readonly restoreLayers: () => void;
    }

    type TransitionState = FadeTransitionState | SlideTransitionState;

    let activeTransition: TransitionState | null = null;

    const getTopEntry = () => sceneStack.at(-1) ?? null;

    const destroyAllScenes = () => {
        while (sceneStack.length > 0) {
            const entry = sceneStack.pop();
            entry?.scene.destroy();
        }
    };

    const createRuntimeContext = (): SceneRuntimeContext => ({
        app,
        layers,
        addToLayer,
        removeFromLayer,
        acquireSprite,
        releaseSprite,
        switchScene,
        pushScene,
        popScene,
        transitionScene,
        designSize,
    });

    const instantiateScene = (name: string): Scene<unknown, UnknownServices> => {
        const registration = sceneRegistrations.get(name);
        if (!registration) {
            throw new Error(`Scene "${name}" is not registered`);
        }

        const runtimeContext = createRuntimeContext();
        const services = registration.provideContext ? registration.provideContext(runtimeContext) : {};

        if (services && typeof services === 'object') {
            for (const key of Reflect.ownKeys(services)) {
                if (Object.prototype.hasOwnProperty.call(runtimeContext, key)) {
                    throw new Error(`Scene context provider attempted to override built-in property "${String(key)}"`);
                }
            }
        }

        const sceneContext = Object.assign({}, runtimeContext, services) as SceneContext<UnknownServices>;
        return registration.factory(sceneContext);
    };

    const pushInternal = async (name: string, payload: unknown, suspendPrevious: boolean) => {
        if (destroyed) {
            throw new Error('Scene manager has been destroyed');
        }

        const previous = getTopEntry();
        if (suspendPrevious && previous) {
            previous.scene.suspend?.();
        }

        const scene = instantiateScene(name);
        const entry = { name, scene } as const;
        sceneStack.push(entry);

        try {
            await Promise.resolve(scene.init(payload));
        } catch (error) {
            sceneStack.pop();
            scene.destroy();
            if (suspendPrevious && previous) {
                previous.scene.resume?.();
            }
            throw error;
        }
    };

    const switchScene = async (name: string, payload?: unknown) => {
        if (destroyed) {
            throw new Error('Scene manager has been destroyed');
        }

        destroyAllScenes();
        await pushInternal(name, payload, false);
    };

    const transitionScene = async (name: string, payload?: unknown, options?: SceneTransitionOptions) => {
        if (destroyed) {
            throw new Error('Scene manager has been destroyed');
        }

        if (activeTransition) {
            throw new Error('A scene transition is already in progress');
        }

        const effect = options?.effect ?? DEFAULT_TRANSITION_EFFECT;
        const durationMs = Math.max(options?.durationMs ?? DEFAULT_TRANSITION_DURATION_MS, 0);
        const easing = options?.easing ?? defaultEase;
        const performImmediateSwitch = async () => {
            await switchScene(name, payload);
        };

        if (effect === 'slide') {
            if (!isTextureRenderer(app.renderer) || durationMs === 0) {
                await performImmediateSwitch();
                return;
            }

            const direction = options?.direction ?? DEFAULT_SLIDE_DIRECTION;
            const previousSnapshot = app.renderer.generateTexture(root);
            const outgoing = new Sprite(previousSnapshot);
            outgoing.alpha = 1;
            outgoing.zIndex = Number.MAX_SAFE_INTEGER - 1;
            outgoing.label = 'scene-transition-outgoing';
            outgoing.x = 0;
            outgoing.y = 0;

            root.addChild(outgoing);

            const durationSeconds = durationMs / 1000;
            let resolveTransition: (() => void) | undefined;
            let rejectTransition: ((error: unknown) => void) | undefined;
            let incoming: Sprite | null = null;
            let restoreLayers: (() => void) | null = null;

            const transitionPromise = new Promise<void>((resolve, reject) => {
                resolveTransition = () => {
                    resolve();
                };
                rejectTransition = (error: unknown) => {
                    if (error instanceof Error) {
                        reject(error);
                        return;
                    }
                    reject(new Error(String(error)));
                };
            });

            try {
                await switchScene(name, payload);

                const incomingTexture = app.renderer.generateTexture(root);
                incoming = new Sprite(incomingTexture);
                incoming.alpha = 1;
                incoming.zIndex = Number.MAX_SAFE_INTEGER;
                incoming.label = 'scene-transition-incoming';
                root.addChild(incoming);

                const originalAlphas = {
                    playfield: layers.playfield.alpha,
                    effects: layers.effects.alpha,
                    hud: layers.hud.alpha,
                };

                const restoreLayersFn = () => {
                    layers.playfield.alpha = originalAlphas.playfield;
                    layers.effects.alpha = originalAlphas.effects;
                    layers.hud.alpha = originalAlphas.hud;
                };

                restoreLayers = restoreLayersFn;

                layers.playfield.alpha = 0;
                layers.effects.alpha = 0;
                layers.hud.alpha = 0;

                const rendererWidth = Math.max(app.renderer.width, designSize.width);
                const rendererHeight = Math.max(app.renderer.height, designSize.height);
                const vectors = resolveSlideVectors(direction, rendererWidth, rendererHeight);
                incoming.x = vectors.startIncoming.x;
                incoming.y = vectors.startIncoming.y;

                activeTransition = {
                    kind: 'slide',
                    outgoing,
                    incoming,
                    direction,
                    durationSeconds,
                    elapsedSeconds: 0,
                    resolve: () => {
                        resolveTransition?.();
                    },
                    reject: (error: unknown) => {
                        rejectTransition?.(error);
                    },
                    easing,
                    startIncoming: vectors.startIncoming,
                    endOutgoing: vectors.endOutgoing,
                    restoreLayers: restoreLayersFn,
                };
            } catch (error) {
                root.removeChild(outgoing);
                outgoing.destroy({ texture: true });
                if (incoming) {
                    root.removeChild(incoming);
                    incoming.destroy({ texture: true });
                }
                restoreLayers?.();
                activeTransition = null;
                rejectTransition?.(error);
                throw error;
            }

            await transitionPromise;
            return;
        }

        if (effect !== 'fade') {
            await performImmediateSwitch();
            return;
        }

        if (!isTextureRenderer(app.renderer)) {
            await performImmediateSwitch();
            return;
        }

        const previousSnapshot = app.renderer.generateTexture(root);
        const overlay = new Sprite(previousSnapshot);
        overlay.alpha = 1;
        overlay.zIndex = Number.MAX_SAFE_INTEGER;
        overlay.label = 'scene-transition-overlay';

        root.addChild(overlay);

        if (durationMs === 0) {
            try {
                await performImmediateSwitch();
            } finally {
                root.removeChild(overlay);
                overlay.destroy({ texture: true });
            }
            return;
        }

        const durationSeconds = durationMs / 1000;
        let resolveTransition: (() => void) | undefined;
        let rejectTransition: ((error: unknown) => void) | undefined;

        activeTransition = {
            kind: 'fade',
            sprite: overlay,
            durationSeconds,
            elapsedSeconds: 0,
            resolve: () => {
                resolveTransition?.();
            },
            reject: (error: unknown) => {
                rejectTransition?.(error);
            },
            easing,
        };

        const transitionPromise = new Promise<void>((resolve, reject) => {
            resolveTransition = () => {
                resolve();
            };
            rejectTransition = (error: unknown) => {
                if (error instanceof Error) {
                    reject(error);
                    return;
                }
                reject(new Error(String(error)));
            };
        });

        try {
            await performImmediateSwitch();
        } catch (error) {
            root.removeChild(overlay);
            overlay.destroy({ texture: true });
            activeTransition = null;
            rejectTransition?.(error);
            throw error;
        }

        await transitionPromise;
    };

    const pushScene = async (name: string, payload?: unknown) => pushInternal(name, payload, true);

    const popScene = () => {
        if (destroyed) {
            throw new Error('Scene manager has been destroyed');
        }

        const popped = sceneStack.pop();
        if (!popped) {
            return;
        }

        popped.scene.destroy();

        const next = getTopEntry();
        next?.scene.resume?.();
    };

    const register = <TPayload = unknown, TServices extends object = Record<string, never>>(
        name: string,
        factory: SceneFactory<TPayload, TServices>,
        options?: SceneRegistrationOptions<TServices>,
    ) => {
        if (sceneRegistrations.has(name)) {
            throw new Error(`Scene "${name}" already registered`);
        }
        sceneRegistrations.set(name, {
            factory: factory as SceneFactory<unknown, UnknownServices>,
            provideContext: options?.provideContext as SceneContextProvider<UnknownServices> | undefined,
        });
    };

    const update = (deltaSeconds: number) => {
        if (activeTransition) {
            const state = activeTransition;
            state.elapsedSeconds += deltaSeconds;
            const duration = state.durationSeconds;
            const progressRatio = duration <= 0 ? 1 : state.elapsedSeconds / duration;
            const progress = Math.min(progressRatio, 1);
            const eased = state.easing(progress);
            const clamped = Math.min(Math.max(eased, 0), 1);

            if (state.kind === 'fade') {
                state.sprite.alpha = 1 - clamped;

                if (progress >= 1) {
                    root.removeChild(state.sprite);
                    state.sprite.destroy({ texture: true });
                    activeTransition = null;
                    state.resolve();
                }
            } else {
                state.incoming.x = state.startIncoming.x + (0 - state.startIncoming.x) * clamped;
                state.incoming.y = state.startIncoming.y + (0 - state.startIncoming.y) * clamped;
                state.outgoing.x = state.endOutgoing.x * clamped;
                state.outgoing.y = state.endOutgoing.y * clamped;

                if (progress >= 1) {
                    state.restoreLayers();
                    root.removeChild(state.outgoing);
                    root.removeChild(state.incoming);
                    state.outgoing.destroy({ texture: true });
                    state.incoming.destroy({ texture: true });
                    activeTransition = null;
                    state.resolve();
                }
            }
        }

        const current = getTopEntry();
        current?.scene.update(deltaSeconds);
    };

    const destroy = () => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        if (activeTransition) {
            if (activeTransition.kind === 'fade') {
                root.removeChild(activeTransition.sprite);
                activeTransition.sprite.destroy({ texture: true });
            } else {
                root.removeChild(activeTransition.outgoing);
                root.removeChild(activeTransition.incoming);
                activeTransition.outgoing.destroy({ texture: true });
                activeTransition.incoming.destroy({ texture: true });
                activeTransition.restoreLayers();
            }
            activeTransition.reject(new Error('Scene manager has been destroyed'));
            activeTransition = null;
        }
        destroyAllScenes();
        spritePool.clear();
        if (typeof root.removeChildren === 'function') {
            root.removeChildren();
        }
        if (detachOnDestroy && config.parent?.contains(canvas)) {
            config.parent.removeChild(canvas);
        }
        app.destroy();
    };

    const handle: SceneManagerHandle = {
        app,
        canvas,
        layers,
        acquireSprite,
        releaseSprite,
        addToLayer,
        removeFromLayer,
        resize,
        designSize,
        register,
        switch: switchScene,
        transition: transitionScene,
        push: pushScene,
        pop: popScene,
        update,
        getCurrentScene: () => getTopEntry()?.name ?? null,
        destroy,
    };

    return handle;
};
