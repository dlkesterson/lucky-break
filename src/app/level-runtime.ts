import { Graphics, Container, Sprite } from 'pixi.js';
import { Body as MatterBody, Bodies } from 'matter-js';
import type { Body } from 'matter-js';
import type { StageHandle } from 'render/stage';
import type { PhysicsWorldHandle } from 'physics/world';
import {
    generateLevelLayout,
    getLevelSpec,
    getPresetLevelCount,
    getLevelDifficultyMultiplier,
    remixLevel,
    type BrickSpec,
} from 'util/levels';
import { mixColors } from 'render/playfield-visuals';
import { createBrickTextureCache } from 'render/brick-texture-cache';
import type { PowerUpType } from 'util/power-ups';
import { distance } from 'util/geometry';

export interface BrickLayoutBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

interface GhostBrickEffect {
    readonly body: Body;
    readonly restore: () => void;
    remaining: number;
}

export interface FallingPowerUp {
    readonly type: PowerUpType;
    readonly body: Body;
    readonly visual: Graphics;
}

export interface LevelLoadResult {
    readonly breakableBricks: number;
    readonly powerUpChanceMultiplier: number;
    readonly difficultyMultiplier: number;
    readonly layoutBounds: BrickLayoutBounds | null;
}

export interface LevelRuntimeOptions {
    readonly physics: PhysicsWorldHandle;
    readonly stage: StageHandle;
    readonly visualBodies: Map<Body, Container>;
    readonly removeBodyVisual: (body: Body) => void;
    readonly playfieldWidth: number;
    readonly brickSize: { readonly width: number; readonly height: number };
    readonly brickLighting: { readonly radius: number; readonly restAlpha: number };
    readonly rowColors: readonly number[];
    readonly powerUp: { readonly radius: number; readonly fallSpeed: number };
}

export interface LevelRuntimeHandle {
    readonly brickHealth: Map<Body, number>;
    readonly brickMetadata: Map<Body, BrickSpec>;
    readonly brickVisualState: Map<Body, { baseColor: number; maxHp: number; currentHp: number }>;
    loadLevel(levelIndex: number): LevelLoadResult;
    updateBrickLighting(position: { readonly x: number; readonly y: number }): void;
    updateBrickDamage(body: Body, currentHp: number): void;
    spawnPowerUp(type: PowerUpType, position: { readonly x: number; readonly y: number }): void;
    findPowerUp(body: Body): FallingPowerUp | null;
    removePowerUp(powerUp: FallingPowerUp): void;
    clearActivePowerUps(): void;
    resetGhostBricks(): void;
    clearGhostEffect(body: Body): void;
    applyGhostBrickReward(duration: number, count: number): void;
    updateGhostBricks(deltaSeconds: number): number;
    getGhostBrickRemainingDuration(): number;
}

export const createLevelRuntime = ({
    physics,
    stage,
    visualBodies,
    removeBodyVisual,
    playfieldWidth,
    brickSize,
    brickLighting,
    rowColors,
    powerUp,
}: LevelRuntimeOptions): LevelRuntimeHandle => {
    const presetLevelCount = getPresetLevelCount();

    const brickHealth = new Map<Body, number>();
    const brickMetadata = new Map<Body, BrickSpec>();
    const brickVisualState = new Map<Body, { baseColor: number; maxHp: number; currentHp: number }>();
    const ghostBrickEffects: GhostBrickEffect[] = [];
    const activePowerUps: FallingPowerUp[] = [];
    const brickTextures = createBrickTextureCache(stage.app.renderer);

    const updateBrickLighting: LevelRuntimeHandle['updateBrickLighting'] = (ballPosition) => {
        brickVisualState.forEach((state, body) => {
            const visual = visualBodies.get(body);
            if (!(visual instanceof Sprite)) {
                return;
            }

            const dist = distance(ballPosition, body.position);
            if (dist < brickLighting.radius) {
                const proximity = 1 - dist / brickLighting.radius;
                const eased = Math.pow(proximity, 0.75);
                const tint = mixColors(0xffffff, state.baseColor, Math.min(1, 1 - eased * 0.85));
                visual.tint = tint;
                visual.alpha = Math.min(1.3, brickLighting.restAlpha + eased * 0.45);
                visual.blendMode = 'add';
            } else {
                visual.tint = 0xffffff;
                visual.alpha = brickLighting.restAlpha;
                visual.blendMode = 'normal';
            }
        });
    };

    const updateBrickDamage: LevelRuntimeHandle['updateBrickDamage'] = (body, currentHp) => {
        const visual = visualBodies.get(body);
        if (!(visual instanceof Sprite)) {
            return;
        }

        const state = brickVisualState.get(body);
        if (!state) {
            return;
        }

        const safeHp = Math.max(0, Math.min(state.maxHp, Math.round(currentHp)));
        state.currentHp = safeHp;

        const texture = brickTextures.get({
            baseColor: state.baseColor,
            maxHp: state.maxHp,
            currentHp: safeHp,
            width: brickSize.width,
            height: brickSize.height,
        });

        visual.texture = texture;
        visual.alpha = brickLighting.restAlpha;
        visual.tint = 0xffffff;
        visual.blendMode = 'normal';
    };

    const clearBricks = () => {
        const bodies = Array.from(brickHealth.keys());
        bodies.forEach((body) => {
            physics.remove(body);
            removeBodyVisual(body);
        });
        brickHealth.clear();
        brickMetadata.clear();
        brickVisualState.clear();
    };

    const loadLevel: LevelRuntimeHandle['loadLevel'] = (levelIndex) => {
        resetGhostBricks();
        clearBricks();
        clearActivePowerUps();

        const baseSpec = getLevelSpec(levelIndex);
        const loopCount = Math.floor(levelIndex / presetLevelCount);
        const effectiveSpec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
        const layout = generateLevelLayout(effectiveSpec, brickSize.width, brickSize.height, playfieldWidth);
        const difficultyMultiplier = getLevelDifficultyMultiplier(levelIndex);
        const chanceMultiplier = effectiveSpec.powerUpChanceMultiplier ?? 1;

        if (layout.bricks.length === 0) {
            return {
                breakableBricks: layout.breakableCount,
                powerUpChanceMultiplier: chanceMultiplier,
                difficultyMultiplier,
                layoutBounds: null,
            } satisfies LevelLoadResult;
        }

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        layout.bricks.forEach((brickSpec) => {
            const brick = physics.factory.brick({
                size: { width: brickSize.width, height: brickSize.height },
                position: { x: brickSpec.x, y: brickSpec.y },
            });
            physics.add(brick);

            const paletteColor = rowColors[brickSpec.row % rowColors.length];
            const maxHp = Math.max(1, brickSpec.hp);
            const texture = brickTextures.get({
                baseColor: paletteColor,
                maxHp,
                currentHp: maxHp,
                width: brickSize.width,
                height: brickSize.height,
            });
            const brickVisual = new Sprite(texture);
            brickVisual.anchor.set(0.5);
            brickVisual.position.set(brickSpec.x, brickSpec.y);
            brickVisual.zIndex = 5;
            brickVisual.alpha = brickLighting.restAlpha;
            brickVisual.eventMode = 'none';
            visualBodies.set(brick, brickVisual);
            stage.layers.playfield.addChild(brickVisual);

            brickHealth.set(brick, maxHp);
            brickMetadata.set(brick, brickSpec);
            brickVisualState.set(brick, { baseColor: paletteColor, maxHp, currentHp: maxHp });

            minX = Math.min(minX, brickSpec.x - brickSize.width / 2);
            maxX = Math.max(maxX, brickSpec.x + brickSize.width / 2);
            minY = Math.min(minY, brickSpec.y - brickSize.height / 2);
            maxY = Math.max(maxY, brickSpec.y + brickSize.height / 2);
        });

        return {
            breakableBricks: layout.breakableCount,
            powerUpChanceMultiplier: chanceMultiplier,
            difficultyMultiplier,
            layoutBounds: {
                minX,
                maxX,
                minY,
                maxY,
            },
        } satisfies LevelLoadResult;
    };

    const spawnPowerUp: LevelRuntimeHandle['spawnPowerUp'] = (type, position) => {
        const body = Bodies.circle(position.x, position.y, powerUp.radius, {
            label: 'powerup',
            isSensor: true,
            frictionAir: 0,
        });

        MatterBody.setVelocity(body, { x: 0, y: powerUp.fallSpeed });
        physics.add(body);

        const colorMap: Record<PowerUpType, number> = {
            'paddle-width': 0x00ffff,
            'ball-speed': 0xffaa33,
            'multi-ball': 0xff66cc,
            'sticky-paddle': 0x66ff99,
        };

        const visual = new Graphics();
        visual.circle(0, 0, powerUp.radius);
        visual.fill({ color: colorMap[type], alpha: 0.9 });
        visual.position.set(position.x, position.y);
        stage.addToLayer('effects', visual);

        visualBodies.set(body, visual);
        activePowerUps.push({ type, body, visual });
    };

    const findPowerUp: LevelRuntimeHandle['findPowerUp'] = (body) => {
        return activePowerUps.find((entry) => entry.body === body) ?? null;
    };

    const removePowerUp: LevelRuntimeHandle['removePowerUp'] = (powerUpEntry) => {
        physics.remove(powerUpEntry.body);
        removeBodyVisual(powerUpEntry.body);
        const index = activePowerUps.indexOf(powerUpEntry);
        if (index >= 0) {
            activePowerUps.splice(index, 1);
        }
    };

    const clearActivePowerUps: LevelRuntimeHandle['clearActivePowerUps'] = () => {
        while (activePowerUps.length > 0) {
            const entry = activePowerUps.pop();
            if (!entry) {
                continue;
            }
            physics.remove(entry.body);
            removeBodyVisual(entry.body);
        }
    };

    const resetGhostBricks: LevelRuntimeHandle['resetGhostBricks'] = () => {
        while (ghostBrickEffects.length > 0) {
            ghostBrickEffects.pop()?.restore();
        }
    };

    const clearGhostEffect: LevelRuntimeHandle['clearGhostEffect'] = (body) => {
        const index = ghostBrickEffects.findIndex((effect) => effect.body === body);
        if (index >= 0) {
            ghostBrickEffects[index].restore();
            ghostBrickEffects.splice(index, 1);
        }
    };

    const applyGhostBrickReward: LevelRuntimeHandle['applyGhostBrickReward'] = (duration, count) => {
        resetGhostBricks();

        if (count <= 0) {
            return;
        }

        const bricks = Array.from(brickHealth.keys()).filter((body) => body.label === 'brick');
        if (bricks.length === 0) {
            return;
        }

        const selected = [...bricks]
            .sort((lhs, rhs) => lhs.id - rhs.id)
            .slice(0, Math.min(count, bricks.length));

        selected.forEach((body) => {
            const originalSensor = body.isSensor;
            body.isSensor = true;

            const visual = visualBodies.get(body);
            const isRenderable = visual instanceof Graphics || visual instanceof Sprite;
            const originalAlpha = isRenderable ? visual.alpha : undefined;
            if (isRenderable) {
                visual.alpha = 0.35;
            }

            ghostBrickEffects.push({
                body,
                remaining: duration,
                restore: () => {
                    body.isSensor = originalSensor;
                    if (isRenderable && originalAlpha !== undefined) {
                        visual.alpha = originalAlpha;
                    }
                },
            });
        });
    };

    const updateGhostBricks: LevelRuntimeHandle['updateGhostBricks'] = (deltaSeconds) => {
        for (let index = ghostBrickEffects.length - 1; index >= 0; index -= 1) {
            const effect = ghostBrickEffects[index];
            effect.remaining -= deltaSeconds;
            if (effect.remaining <= 0) {
                effect.restore();
                ghostBrickEffects.splice(index, 1);
            }
        }
        return ghostBrickEffects.length;
    };

    const getGhostBrickRemainingDuration: LevelRuntimeHandle['getGhostBrickRemainingDuration'] = () => {
        if (ghostBrickEffects.length === 0) {
            return 0;
        }
        return ghostBrickEffects.reduce((max, effect) => Math.max(max, effect.remaining), 0);
    };

    return {
        brickHealth,
        brickMetadata,
        brickVisualState,
        loadLevel,
        updateBrickLighting,
        updateBrickDamage,
        spawnPowerUp,
        findPowerUp,
        removePowerUp,
        clearActivePowerUps,
        resetGhostBricks,
        clearGhostEffect,
        applyGhostBrickReward,
        updateGhostBricks,
        getGhostBrickRemainingDuration,
    } satisfies LevelRuntimeHandle;
};
