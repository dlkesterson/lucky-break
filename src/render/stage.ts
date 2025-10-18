import { Container, FillGradient, Graphics } from 'pixi.js';
import { createSceneManager, type SceneManagerConfig, type SceneManagerHandle, type StageLayers } from './scene-manager';
import { GameTheme, type GameThemeDefinition } from './theme';

export type StageConfig = SceneManagerConfig;

export interface ThemedStageConfig extends StageConfig {
    readonly theme?: GameThemeDefinition;
}

export interface StageHandle extends SceneManagerHandle {
    readonly backgroundLayer: Container;
    readonly backgroundGraphic: Graphics;
    readonly theme: GameThemeDefinition;
    applyTheme(theme: GameThemeDefinition): void;
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

    let activeTheme = requestedTheme;
    paintBackground(backgroundGraphic, activeTheme, baseHandle.designSize);

    const applyTheme = (nextTheme: GameThemeDefinition) => {
        activeTheme = nextTheme;
        paintBackground(backgroundGraphic, activeTheme, baseHandle.designSize);
    };

    const themedHandle: StageHandle = {
        ...baseHandle,
        backgroundLayer,
        backgroundGraphic,
        applyTheme,
        get theme() {
            return activeTheme;
        },
    };

    return themedHandle;
};

export type { StageLayers };
