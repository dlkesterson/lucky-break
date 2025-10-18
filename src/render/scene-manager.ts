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

export interface SceneContext {
    readonly app: Application;
    readonly layers: StageLayers;
    readonly addToLayer: (layer: SceneLayerName, container: Container) => void;
    readonly removeFromLayer: (container: Container) => void;
    readonly acquireSprite: () => Sprite;
    readonly releaseSprite: (sprite: Sprite) => void;
    readonly switchScene: <TPayload = unknown>(name: string, payload?: TPayload) => Promise<void>;
    readonly designSize: SceneDimensions;
}

export interface Scene<TPayload = unknown> {
    init(payload?: TPayload): void | Promise<void>;
    update(deltaSeconds: number): void;
    destroy(): void;
}

export type SceneFactory<TPayload = unknown> = (context: SceneContext) => Scene<TPayload>;

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
    register<TPayload = unknown>(name: string, factory: SceneFactory<TPayload>): void;
    switch<TPayload = unknown>(name: string, payload?: TPayload): Promise<void>;
    update(deltaSeconds: number): void;
    getCurrentScene(): string | null;
    destroy(): void;
}

const resolveResolution = (config: StageConfig): number => {
    if (config.resolution) {
        return config.resolution;
    }

    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
        return window.devicePixelRatio;
    }

    return 1;
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

    const sceneFactories = new Map<string, SceneFactory<unknown>>();
    let currentSceneName: string | null = null;
    let currentScene: Scene<unknown> | null = null;
    let destroyed = false;

    const switchScene = async (name: string, payload?: unknown) => {
        if (destroyed) {
            throw new Error('Scene manager has been destroyed');
        }

        const factory = sceneFactories.get(name);
        if (!factory) {
            throw new Error(`Scene "${name}" is not registered`);
        }

        if (currentScene) {
            currentScene.destroy();
            currentScene = null;
            currentSceneName = null;
        }

        const nextScene = factory(sceneContext);
        currentScene = nextScene;
        currentSceneName = name;
        await Promise.resolve(nextScene.init(payload));
    };

    const sceneContext: SceneContext = {
        app,
        layers,
        addToLayer,
        removeFromLayer,
        acquireSprite,
        releaseSprite,
        switchScene,
        designSize,
    };

    const register = <TPayload,>(name: string, factory: SceneFactory<TPayload>) => {
        if (sceneFactories.has(name)) {
            throw new Error(`Scene "${name}" already registered`);
        }
        sceneFactories.set(name, factory as SceneFactory<unknown>);
    };

    const update = (deltaSeconds: number) => {
        currentScene?.update(deltaSeconds);
    };

    const destroy = () => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        if (currentScene) {
            currentScene.destroy();
            currentScene = null;
            currentSceneName = null;
        }
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
        update,
        getCurrentScene: () => currentSceneName,
        destroy,
    };

    return handle;
};
