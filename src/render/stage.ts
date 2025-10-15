import { Application, Container, Sprite } from 'pixi.js';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

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

type StageLayerName = 'playfield' | 'effects' | 'hud';

interface SpritePool<T> {
    acquire: () => T;
    release: (value: T) => void;
    clear: () => void;
}

const createSpritePool = <T>(factory: () => T): SpritePool<T> => {
    const free: T[] = [];

    return {
        acquire: () => free.pop() ?? factory(),
        release: (value) => {
            free.push(value);
        },
        clear: () => {
            free.length = 0;
        },
    };
};

const resizeRenderer = (app: Application, width: number, height: number): void => {
    const renderer = app.renderer as unknown as { resize?: (...args: unknown[]) => void };
    const resize = renderer.resize;

    if (typeof resize === 'function') {
        if (resize.length <= 1) {
            resize.call(renderer, { width, height });
            return;
        }

        resize.call(renderer, width, height);
    }
};

export interface StageHandle {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly layers: StageLayers;
    readonly acquireSprite: () => Sprite;
    readonly releaseSprite: (sprite: Sprite) => void;
    readonly addToLayer: (layer: StageLayerName, displayObject: Container) => void;
    readonly removeFromLayer: (displayObject: Container) => void;
    readonly resize: (size: { readonly width: number; readonly height: number }) => void;
    readonly destroy: () => void;
}

const DEFAULT_BACKGROUND = 0x000000;

const resolveResolution = (config: StageConfig): number => {
    if (config.resolution) {
        return config.resolution;
    }

    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
        return window.devicePixelRatio;
    }

    return 1;
};

export const createStage = async (config: StageConfig = {}): Promise<StageHandle> => {
    const width = config.width ?? DEFAULT_WIDTH;
    const height = config.height ?? DEFAULT_HEIGHT;
    const resolution = resolveResolution(config);

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

    const canvas = app.canvas as HTMLCanvasElement;
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

    const addToLayer: StageHandle['addToLayer'] = (layerName, displayObject) => {
        const layer = layers[layerName];
        if (!layer.children.includes(displayObject)) {
            layer.addChild(displayObject);
        }
    };

    const removeFromLayer: StageHandle['removeFromLayer'] = (displayObject) => {
        const parent = displayObject.parent;
        if (parent) {
            parent.removeChild(displayObject);
        }
    };

    const acquireSprite: StageHandle['acquireSprite'] = () => {
        const sprite = spritePool.acquire();
        sprite.visible = true;
        sprite.alpha = 1;
        return sprite;
    };

    const releaseSprite: StageHandle['releaseSprite'] = (sprite) => {
        removeFromLayer(sprite);
        sprite.visible = false;
        sprite.alpha = 1;
        spritePool.release(sprite);
    };

    const resize: StageHandle['resize'] = (size) => {
        resizeRenderer(app, size.width, size.height);
    };

    const destroy: StageHandle['destroy'] = () => {
        spritePool.clear();
        if (typeof root.removeChildren === 'function') {
            root.removeChildren();
        }

        if (detachOnDestroy && config.parent?.contains(canvas)) {
            config.parent.removeChild(canvas);
        }

        app.destroy();
    };

    return {
        app,
        canvas,
        layers,
        acquireSprite,
        releaseSprite,
        addToLayer,
        removeFromLayer,
        resize,
        destroy,
    };
};
