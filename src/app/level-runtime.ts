import { Graphics, Container, Sprite } from 'pixi.js';
import * as PixiJS from 'pixi.js';
import { gameConfig } from 'config/game';
import { Body as MatterBody, Bodies } from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import type { StageHandle } from 'render/stage';
import type { PhysicsWorldHandle } from 'physics/world';
import {
    generateLevelLayout,
    getLevelSpec,
    getPresetLevelCount,
    getLevelDifficultyMultiplier,
    remixLevel,
    getLoopScalingInfo,
    MAX_LEVEL_BRICK_HP,
    type BrickSpec,
    type BrickForm,
    type LevelSpec,
    type LevelGenerationOptions,
} from 'util/levels';
import { mixColors } from 'render/playfield-visuals';
import { createBrickTextureCache, type BrickTextureOverrides } from 'render/brick-texture-cache';
import type { PowerUpType } from 'util/power-ups';
import { distance } from 'util/geometry';
import {
    createGravityWellHazard,
    createMovingBumperHazard,
    createPortalHazard,
    type PhysicsHazard,
} from 'physics/hazards';
import type { RandomSource } from 'util/random';

type BrickHpLabel = Container & { text?: string };

const WALL_BRICK_COLOR = 0xffffff;
const WALL_STROKE_COLOR = 0xa4acb6;

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

export interface FallingCoin {
    readonly value: number;
    readonly body: Body;
    readonly visual: Graphics;
}

export interface SpawnCoinOptions {
    readonly value: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly fallSpeed?: number;
}

export type LevelHazardDescriptor =
    | {
        readonly id: string;
        readonly type: 'gravity-well';
        readonly position: { x: number; y: number };
        readonly radius: number;
        readonly strength: number;
        readonly falloff: 'none' | 'linear';
    }
    | {
        readonly id: string;
        readonly type: 'moving-bumper';
        readonly position: { x: number; y: number };
        readonly radius: number;
        readonly impulse: number;
        readonly direction: { x: number; y: number };
    }
    | {
        readonly id: string;
        readonly type: 'portal';
        readonly position: { x: number; y: number };
        readonly radius: number;
        readonly exit: { x: number; y: number };
        readonly cooldownSeconds: number;
    };

export interface LevelLoadResult {
    readonly breakableBricks: number;
    readonly powerUpChanceMultiplier: number;
    readonly difficultyMultiplier: number;
    readonly layoutBounds: BrickLayoutBounds | null;
    readonly hazards: readonly LevelHazardDescriptor[];
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
    readonly coin: { readonly radius: number; readonly fallSpeed: number };
    readonly layoutOrientation?: 'portrait' | 'landscape';
    readonly getLayoutRandom?: (levelIndex: number) => RandomSource;
    readonly decorateBrick?: LevelGenerationOptions['decorateBrick'];
}

export interface LevelRuntimeHandle {
    readonly brickHealth: Map<Body, number>;
    readonly brickMetadata: Map<Body, BrickSpec>;
    readonly brickVisualState: Map<Body, {
        baseColor: number;
        maxHp: number;
        currentHp: number;
        form: BrickForm;
        hasHpLabel: boolean;
        hpLabel?: BrickHpLabel | null;
        isBreakable: boolean;
    }>;
    loadLevel(levelIndex: number): LevelLoadResult;
    setRowColors(rowColors: readonly number[]): void;
    updateBrickLighting(position: { readonly x: number; readonly y: number }): void;
    updateBrickDamage(body: Body, currentHp: number): void;
    spawnPowerUp(type: PowerUpType, position: { readonly x: number; readonly y: number }): void;
    findPowerUp(body: Body): FallingPowerUp | null;
    removePowerUp(powerUp: FallingPowerUp): void;
    clearActivePowerUps(): void;
    spawnCoin(options: SpawnCoinOptions): void;
    findCoin(body: Body): FallingCoin | null;
    removeCoin(coin: FallingCoin): void;
    clearActiveCoins(): void;
    resetGhostBricks(): void;
    clearGhostEffect(body: Body): void;
    applyGhostBrickReward(duration: number, count: number): void;
    updateGhostBricks(deltaSeconds: number): number;
    getGhostBrickRemainingDuration(): number;
    forceClearBreakableBricks(): number;
    clearActiveHazards(): void;
    getActiveHazards(): readonly LevelHazardDescriptor[];
    findHazard(body: Body): LevelHazardDescriptor | null;
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
    coin,
    layoutOrientation,
    getLayoutRandom,
    decorateBrick,
}: LevelRuntimeOptions): LevelRuntimeHandle => {
    const levelConfig = gameConfig.levels;
    const presetLevelCount = getPresetLevelCount();

    const brickHealth = new Map<Body, number>();
    const brickMetadata = new Map<Body, BrickSpec>();
    const brickVisualState = new Map<Body, {
        baseColor: number;
        maxHp: number;
        currentHp: number;
        form: BrickForm;
        hasHpLabel: boolean;
        hpLabel?: BrickHpLabel | null;
        isBreakable: boolean;
        alwaysShowHpLabel: boolean;
        textureOverride?: BrickTextureOverrides;
    }>();
    const ghostBrickEffects: GhostBrickEffect[] = [];
    const activePowerUps: FallingPowerUp[] = [];
    const activeCoins: FallingCoin[] = [];
    interface ActiveHazardEntry {
        readonly descriptor: LevelHazardDescriptor;
        readonly hazard: PhysicsHazard;
        readonly body: Body | null;
        readonly visuals: readonly Graphics[];
    }
    const activeHazards: ActiveHazardEntry[] = [];
    const hazardByBody = new Map<Body, LevelHazardDescriptor>();
    const brickTextures = createBrickTextureCache(stage.app.renderer);
    const ensureHpLabel = (
        visual: Sprite,
        existing: BrickHpLabel | null | undefined,
        value: string,
    ): BrickHpLabel => {
        if (existing) {
            if ('text' in existing && typeof existing.text === 'string') {
                existing.text = value;
            }
            existing.visible = value.length > 0;
            return existing;
        }
        let label: BrickHpLabel;
        const hasTextCtor = typeof PixiJS === 'object' && PixiJS !== null && Object.prototype.hasOwnProperty.call(PixiJS, 'Text');
        const TextCtor = hasTextCtor ? PixiJS.Text : null;
        if (typeof TextCtor === 'function') {
            const fontSize = Math.max(12, Math.round(brickSize.height * 0.55));
            const strokeWidth = Math.max(2, Math.round(fontSize * 0.18));
            label = new TextCtor(value, {
                fontSize,
                fontWeight: 'bold',
                fontFamily: 'Luckiest Guy, Overpass, sans-serif',
                fill: 0xffffff,
                stroke: { color: 0x000000, width: strokeWidth, join: 'round' },
                align: 'center',
                letterSpacing: 1,
            }) as BrickHpLabel;
        } else {
            const placeholder = new Container() as BrickHpLabel;
            placeholder.text = value;
            placeholder.alpha = 0;
            label = placeholder;
        }

        const anchorCandidate = (label as unknown as { anchor?: { set?: (x: number, y?: number) => void } }).anchor;
        if (anchorCandidate && typeof anchorCandidate.set === 'function') {
            anchorCandidate.set(0.5);
        } else {
            const pivotCandidate = (label as unknown as { pivot?: { set?: (x: number, y?: number) => void } }).pivot;
            if (pivotCandidate && typeof pivotCandidate.set === 'function') {
                pivotCandidate.set(brickSize.width * 0.5, brickSize.height * 0.5);
            }
        }

        if ('text' in label && typeof label.text === 'string') {
            label.text = value;
        }

        label.position.set(0, 0);
        label.eventMode = 'none';
        label.alpha = typeof TextCtor === 'function' ? 0.96 : 0;
        label.zIndex = 10;
        label.visible = value.length > 0;
        visual.sortableChildren = true;
        visual.addChild(label);
        return label;
    };

    const removeHpLabel = (visual: Sprite, label: BrickHpLabel | null | undefined): void => {
        if (!label) {
            return;
        }
        if (label.parent === visual) {
            visual.removeChild(label);
        } else if (label.parent) {
            label.parent.removeChild(label);
        }
        label.visible = false;
        label.destroy();
    };
    let paletteRowColors = rowColors.length > 0 ? [...rowColors] : [0xffffff];

    const resolvePaletteColor = (rowIndex: number): number => {
        const palette = paletteRowColors;
        if (palette.length === 0) {
            return 0xffffff;
        }
        const normalized = rowIndex % palette.length;
        const safeIndex = normalized < 0 ? normalized + palette.length : normalized;
        return palette[safeIndex];
    };

    const updateBrickLighting: LevelRuntimeHandle['updateBrickLighting'] = (ballPosition) => {
        brickVisualState.forEach((state, body) => {
            const visual = visualBodies.get(body);
            if (!(visual instanceof Sprite)) {
                return;
            }

            if (!state.isBreakable) {
                visual.texture = brickTextures.get({
                    baseColor: state.baseColor,
                    maxHp: state.maxHp,
                    currentHp: state.currentHp,
                    width: brickSize.width,
                    height: brickSize.height,
                    form: state.form,
                    override: state.textureOverride,
                });
                visual.tint = 0xffffff;
                visual.alpha = Math.min(brickLighting.restAlpha, 0.7);
                visual.blendMode = 'normal';
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

        const rawCurrentHp = Math.round(currentHp);
        const nextMaxHp = state.isBreakable
            ? Math.min(MAX_LEVEL_BRICK_HP, Math.max(state.maxHp, rawCurrentHp))
            : Math.max(state.maxHp, rawCurrentHp);
        state.maxHp = nextMaxHp;
        const safeHp = Math.max(0, Math.min(nextMaxHp, rawCurrentHp));
        state.currentHp = safeHp;

        if (!state.isBreakable) {
            state.currentHp = safeHp;
            visual.texture = brickTextures.get({
                baseColor: state.baseColor,
                maxHp: state.maxHp,
                currentHp: state.currentHp,
                width: brickSize.width,
                height: brickSize.height,
                form: state.form,
                override: state.textureOverride,
            });
            visual.alpha = Math.min(brickLighting.restAlpha, 0.7);
            visual.tint = 0xffffff;
            visual.blendMode = 'normal';
            return;
        }

        visual.texture = brickTextures.get({
            baseColor: state.baseColor,
            maxHp: state.maxHp,
            currentHp: safeHp,
            width: brickSize.width,
            height: brickSize.height,
            form: state.form,
            override: state.textureOverride,
        });
        visual.alpha = brickLighting.restAlpha;
        visual.tint = 0xffffff;
        visual.blendMode = 'normal';

        const shouldShowLabel = state.isBreakable && (state.maxHp > 1 || state.alwaysShowHpLabel);

        if (shouldShowLabel) {
            const displayHp = Math.max(0, safeHp);
            const labelText = state.maxHp > 1 ? `${displayHp}/${state.maxHp}` : `${displayHp}`;
            const label = ensureHpLabel(visual, state.hpLabel, labelText);
            label.visible = safeHp > 0;
            state.hpLabel = label;
            state.hasHpLabel = true;
        } else if (state.hasHpLabel) {
            removeHpLabel(visual, state.hpLabel);
            state.hpLabel = null;
            state.hasHpLabel = false;
        }
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

    const orientation = layoutOrientation ?? 'landscape';

    const remapHpForSwappedRows = (
        hpResolver: LevelSpec['hpPerRow'],
        originalRowCount: number,
        targetRowCount: number,
    ): LevelSpec['hpPerRow'] => {
        if (!hpResolver) {
            return undefined;
        }
        if (originalRowCount <= 0) {
            return () => 1;
        }
        const resolver = hpResolver;
        const maxOriginalIndex = Math.max(0, originalRowCount - 1);
        if (targetRowCount <= 1) {
            return (row: number) => resolver(Math.min(maxOriginalIndex, row));
        }
        return (row: number) => {
            const clampedRow = Math.max(0, Math.min(targetRowCount - 1, row));
            const ratio = clampedRow / (targetRowCount - 1);
            const mapped = Math.round(ratio * maxOriginalIndex);
            return resolver(Math.max(0, Math.min(maxOriginalIndex, mapped)));
        };
    };

    const toOrientationSpec = (spec: LevelSpec): LevelSpec => {
        if (orientation !== 'portrait') {
            return spec;
        }
        if (spec.rows >= spec.cols) {
            return spec;
        }
        const swappedRows = spec.cols;
        const swappedCols = spec.rows;
        const hpPerRow = remapHpForSwappedRows(spec.hpPerRow, spec.rows, swappedRows);
        return {
            ...spec,
            rows: swappedRows,
            cols: swappedCols,
            hpPerRow,
        };
    };

    const loadLevel: LevelRuntimeHandle['loadLevel'] = (levelIndex) => {
        resetGhostBricks();
        clearBricks();
        clearActivePowerUps();
        clearActiveCoins();
        clearActiveHazards();

        let baseSpec = toOrientationSpec(getLevelSpec(levelIndex));
        const loopCount = Math.floor(levelIndex / presetLevelCount);
        if (loopCount === 0) {
            baseSpec = {
                ...baseSpec,
                hpPerRow: () => 1,
            };
        }
        const effectiveSpec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
        const scaling = getLoopScalingInfo(loopCount);
        const layoutRandom = typeof getLayoutRandom === 'function' ? getLayoutRandom(levelIndex) : undefined;
        const gambleChance = Math.min(
            levelConfig.gamble.maxChance,
            Math.max(0, levelConfig.gamble.baseChance + loopCount * levelConfig.gamble.loopBonus),
        );
        const maxGambleBricks = Math.max(0, Math.round(levelConfig.gamble.maxPerLevel));
        const layout = generateLevelLayout(effectiveSpec, brickSize.width, brickSize.height, playfieldWidth, {
            random: layoutRandom,
            fortifiedChance: loopCount === 0 ? 0 : scaling.fortifiedChance,
            voidColumnChance: scaling.voidColumnChance,
            centerFortifiedBias: scaling.centerFortifiedBias,
            maxVoidColumns: scaling.maxVoidColumns,
            gambleChance,
            maxGambleBricks,
            decorateBrick,
        });
        const difficultyMultiplier = getLevelDifficultyMultiplier(levelIndex);
        const chanceMultiplier = effectiveSpec.powerUpChanceMultiplier ?? 1;

        if (layout.bricks.length === 0) {
            return {
                breakableBricks: layout.breakableCount,
                powerUpChanceMultiplier: chanceMultiplier,
                difficultyMultiplier,
                layoutBounds: null,
                hazards: [],
            } satisfies LevelLoadResult;
        }

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        const hazardSummaries: LevelHazardDescriptor[] = [];

        layout.bricks.forEach((brickSpec) => {
            const brickForm = brickSpec.form ?? 'rectangle';
            const brick = physics.factory.brick({
                size: { width: brickSize.width, height: brickSize.height },
                position: { x: brickSpec.x, y: brickSpec.y },
                isSensor: brickSpec.isSensor ?? false,
                shape: brickForm,
            });
            physics.add(brick);

            const paletteColor = resolvePaletteColor(brickSpec.row);
            const isBreakable = brickSpec.breakable !== false;
            const rawHp = Math.max(1, brickSpec.hp);
            const maxHp = isBreakable ? Math.min(MAX_LEVEL_BRICK_HP, rawHp) : rawHp;
            const baseColor = isBreakable ? paletteColor : WALL_BRICK_COLOR;
            const textureOverride: BrickTextureOverrides | undefined = isBreakable
                ? undefined
                : {
                    strokeColor: WALL_STROKE_COLOR,
                    fillColor: WALL_BRICK_COLOR,
                    useFlatFill: true,
                };
            const texture = brickTextures.get({
                baseColor,
                maxHp,
                currentHp: maxHp,
                width: brickSize.width,
                height: brickSize.height,
                form: brickForm,
                override: textureOverride,
            });
            const brickVisual = new Sprite(texture);
            brickVisual.anchor.set(0.5);
            brickVisual.sortableChildren = true;
            brickVisual.position.set(brickSpec.x, brickSpec.y);
            brickVisual.zIndex = 5;
            brickVisual.alpha = isBreakable ? brickLighting.restAlpha : Math.min(brickLighting.restAlpha, 0.7);
            brickVisual.eventMode = 'none';
            visualBodies.set(brick, brickVisual);
            stage.layers.playfield.addChild(brickVisual);

            const alwaysShowHpLabel = isBreakable && (brickSpec.traits?.includes('gamble') ?? false);
            const initialHasHpLabel = isBreakable && (maxHp > 1 || alwaysShowHpLabel);
            let hpLabel: BrickHpLabel | null = null;
            if (initialHasHpLabel) {
                const initialText = maxHp > 1 ? `${maxHp}/${maxHp}` : `${maxHp}`;
                hpLabel = ensureHpLabel(brickVisual, null, initialText);
            }

            brickHealth.set(brick, maxHp);
            brickMetadata.set(brick, brickSpec);
            brickVisualState.set(brick, {
                baseColor,
                maxHp,
                currentHp: maxHp,
                form: brickForm,
                hasHpLabel: initialHasHpLabel,
                hpLabel,
                isBreakable,
                alwaysShowHpLabel,
                textureOverride,
            });

            minX = Math.min(minX, brickSpec.x - brickSize.width / 2);
            maxX = Math.max(maxX, brickSpec.x + brickSize.width / 2);
            minY = Math.min(minY, brickSpec.y - brickSize.height / 2);
            maxY = Math.max(maxY, brickSpec.y + brickSize.height / 2);
        });

        if (layout.breakableCount > 0 && Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
            const layoutWidth = Math.max(0, maxX - minX);
            const layoutHeight = Math.max(0, maxY - minY);
            const shouldSpawnGravityWell = loopCount >= 1 && (layoutWidth > 0 || layoutHeight > 0);

            if (shouldSpawnGravityWell) {
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const baseRadius = Math.max(layoutWidth, layoutHeight) * 0.35;
                const minRadius = Math.max(brickSize.width, brickSize.height) * 2.5;
                const maxRadius = Math.max(playfieldWidth, Math.max(brickSize.width, brickSize.height) * 10) * 0.45;
                const radius = Math.max(minRadius, Math.min(maxRadius, baseRadius));
                const strength = 0.0012 + loopCount * 0.00035;

                const hazard = createGravityWellHazard({
                    id: `gravity-well-${levelIndex}`,
                    position: { x: centerX, y: centerY },
                    radius,
                    strength,
                    falloff: 'linear',
                });

                physics.addHazard(hazard);

                const visual = new Graphics();
                visual.circle(0, 0, radius);
                visual.stroke({ color: 0x6ec1ff, width: 4, alpha: 0.55 });
                visual.fill({ color: 0x6ec1ff, alpha: 0.08 });
                visual.position.set(centerX, centerY);
                visual.zIndex = 4;
                visual.eventMode = 'none';
                stage.addToLayer('effects', visual);

                const descriptor: LevelHazardDescriptor = {
                    id: hazard.id,
                    type: 'gravity-well',
                    position: { x: centerX, y: centerY },
                    radius,
                    strength,
                    falloff: hazard.falloff,
                };

                const hazardBody = hazard.body ?? null;
                activeHazards.push({
                    descriptor,
                    hazard,
                    body: hazardBody,
                    visuals: [visual],
                });
                if (hazardBody) {
                    hazardByBody.set(hazardBody, descriptor);
                }
                hazardSummaries.push(descriptor);
            }

            const shouldSpawnMovingBumper = loopCount >= 2 && layoutWidth > 120;
            if (shouldSpawnMovingBumper) {
                const bumperRadius = Math.max(brickSize.width, brickSize.height) * 0.6;
                const bumperPadding = Math.max(bumperRadius + 24, brickSize.width * 0.75);
                const travelStartX = minX + bumperPadding;
                const travelEndX = maxX - bumperPadding;
                if (travelEndX - travelStartX >= bumperRadius * 0.5) {
                    const centerY = (minY + maxY) / 2;
                    const bumperVisual = new Graphics();
                    bumperVisual.circle(0, 0, bumperRadius);
                    bumperVisual.fill({ color: 0xff9f1c, alpha: 0.85 });
                    bumperVisual.stroke({ color: 0xffffff, width: 4, alpha: 0.7 });
                    bumperVisual.position.set(travelStartX, centerY);
                    bumperVisual.zIndex = 6;
                    bumperVisual.eventMode = 'none';
                    stage.addToLayer('effects', bumperVisual);

                    const descriptorDirection = { x: 0, y: 0 };

                    const movingBumper = createMovingBumperHazard({
                        id: `moving-bumper-${levelIndex}`,
                        start: { x: travelStartX, y: centerY },
                        end: { x: travelEndX, y: centerY },
                        radius: bumperRadius,
                        speed: Math.max(80, layoutWidth / 2),
                        impulse: 4 + loopCount * 0.6,
                        onPositionChange: (pos, direction) => {
                            bumperVisual.position.set(pos.x, pos.y);
                            descriptorDirection.x = direction.x;
                            descriptorDirection.y = direction.y;
                        },
                    });

                    physics.addHazard(movingBumper);

                    const descriptor: LevelHazardDescriptor = {
                        id: movingBumper.id,
                        type: 'moving-bumper',
                        position: movingBumper.position,
                        radius: movingBumper.radius,
                        impulse: movingBumper.impulse,
                        direction: descriptorDirection,
                    };

                    descriptorDirection.x = movingBumper.direction.x;
                    descriptorDirection.y = movingBumper.direction.y;

                    activeHazards.push({
                        descriptor,
                        hazard: movingBumper,
                        body: movingBumper.body ?? null,
                        visuals: [bumperVisual],
                    });

                    if (movingBumper.body) {
                        hazardByBody.set(movingBumper.body, descriptor);
                    }
                    hazardSummaries.push(descriptor);
                }
            }

            const shouldSpawnPortal = loopCount >= 3 && layoutWidth > 100 && layoutHeight > 80;
            if (shouldSpawnPortal) {
                const portalRadius = Math.max(brickSize.width, brickSize.height) * 0.8;
                const centerX = (minX + maxX) / 2;
                const entryY = Math.min(maxY - portalRadius, minY + layoutHeight * 0.4);
                const exitYBase = Math.max(minY - portalRadius * 2, portalRadius + 40);
                const exitY = Math.min(gameConfig.playfield.height - portalRadius - 40, Math.max(exitYBase, maxY + portalRadius * 2));
                const portalExit = { x: centerX, y: exitY };

                const entryVisual = new Graphics();
                entryVisual.circle(0, 0, portalRadius);
                entryVisual.stroke({ color: 0x6c63ff, width: 5, alpha: 0.9 });
                entryVisual.fill({ color: 0x6c63ff, alpha: 0.15 });
                entryVisual.position.set(centerX, entryY);
                entryVisual.zIndex = 5;
                entryVisual.eventMode = 'none';
                stage.addToLayer('effects', entryVisual);

                const exitVisual = new Graphics();
                exitVisual.circle(0, 0, portalRadius * 0.85);
                exitVisual.stroke({ color: 0x00c5ff, width: 4, alpha: 0.7 });
                exitVisual.fill({ color: 0x00c5ff, alpha: 0.12 });
                exitVisual.position.set(portalExit.x, portalExit.y);
                exitVisual.zIndex = 5;
                exitVisual.eventMode = 'none';
                stage.addToLayer('effects', exitVisual);

                const portalHazard = createPortalHazard({
                    id: `portal-${levelIndex}`,
                    entry: { x: centerX, y: entryY },
                    exit: portalExit,
                    radius: portalRadius,
                    cooldownSeconds: 0.45,
                });

                physics.addHazard(portalHazard);

                const descriptor: LevelHazardDescriptor = {
                    id: portalHazard.id,
                    type: 'portal',
                    position: portalHazard.position,
                    radius: portalHazard.radius,
                    exit: portalHazard.exit,
                    cooldownSeconds: portalHazard.cooldownSeconds,
                };

                const visuals: Graphics[] = [entryVisual, exitVisual];

                activeHazards.push({
                    descriptor,
                    hazard: portalHazard,
                    body: portalHazard.body ?? null,
                    visuals,
                });

                if (portalHazard.body) {
                    hazardByBody.set(portalHazard.body, descriptor);
                }
                hazardSummaries.push(descriptor);
            }
        }

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
            hazards: hazardSummaries,
        } satisfies LevelLoadResult;
    };

    const applyRowColors: LevelRuntimeHandle['setRowColors'] = (nextColors) => {
        if (!Array.isArray(nextColors) || nextColors.length === 0) {
            return;
        }
        const filteredColors: number[] = [];
        nextColors.forEach((value) => {
            if (Number.isFinite(value)) {
                filteredColors.push(Number(value));
            }
        });
        if (filteredColors.length === 0) {
            return;
        }
        paletteRowColors = filteredColors;
        brickVisualState.forEach((state, body) => {
            const metadata = brickMetadata.get(body);
            if (!metadata || metadata.breakable === false) {
                return;
            }
            const nextBase = resolvePaletteColor(metadata.row);
            if (nextBase === state.baseColor) {
                return;
            }
            state.baseColor = nextBase;
            const texture = brickTextures.get({
                baseColor: nextBase,
                maxHp: state.maxHp,
                currentHp: state.currentHp,
                width: brickSize.width,
                height: brickSize.height,
                form: state.form,
                override: state.textureOverride,
            });
            const visual = visualBodies.get(body);
            if (visual instanceof Sprite) {
                visual.texture = texture;
                visual.tint = 0xffffff;
                visual.alpha = brickLighting.restAlpha;
                visual.blendMode = 'normal';
            }
        });
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
            laser: 0xff3366,
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

    const spawnCoin: LevelRuntimeHandle['spawnCoin'] = (options) => {
        const fallSpeed = options.fallSpeed ?? coin.fallSpeed;
        const body = Bodies.circle(options.position.x, options.position.y, coin.radius, {
            label: 'coin',
            isSensor: true,
            frictionAir: 0,
        });

        MatterBody.setVelocity(body, { x: 0, y: fallSpeed });
        physics.add(body);

        const visual = new Graphics();
        visual.circle(0, 0, coin.radius);
        visual.fill({ color: 0xf5c542, alpha: 0.92 });
        visual.position.set(options.position.x, options.position.y);
        visual.scale.set(1);
        stage.addToLayer('effects', visual);

        visualBodies.set(body, visual);
        activeCoins.push({ value: options.value, body, visual });
    };

    const findCoin: LevelRuntimeHandle['findCoin'] = (body) => {
        return activeCoins.find((entry) => entry.body === body) ?? null;
    };

    const removeCoin: LevelRuntimeHandle['removeCoin'] = (entry) => {
        physics.remove(entry.body);
        removeBodyVisual(entry.body);
        const index = activeCoins.indexOf(entry);
        if (index >= 0) {
            activeCoins.splice(index, 1);
        }
    };

    const clearActiveCoins: LevelRuntimeHandle['clearActiveCoins'] = () => {
        while (activeCoins.length > 0) {
            const entry = activeCoins.pop();
            if (!entry) {
                continue;
            }
            physics.remove(entry.body);
            removeBodyVisual(entry.body);
        }
    };

    const detachHazardVisual = (visual: Graphics) => {
        const parent = visual.parent;
        if (parent && typeof parent.removeChild === 'function') {
            parent.removeChild(visual);
        }
        visual.destroy();
    };

    const clearActiveHazards: LevelRuntimeHandle['clearActiveHazards'] = () => {
        while (activeHazards.length > 0) {
            const entry = activeHazards.pop();
            if (!entry) {
                continue;
            }
            physics.removeHazard(entry.hazard.id);
            if (entry.body) {
                hazardByBody.delete(entry.body);
            }
            entry.visuals.forEach(detachHazardVisual);
        }
    };

    const getActiveHazards: LevelRuntimeHandle['getActiveHazards'] = () => {
        return activeHazards.map((entry) => entry.descriptor);
    };

    const findHazard: LevelRuntimeHandle['findHazard'] = (body) => {
        return hazardByBody.get(body) ?? null;
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

    const forceClearBreakableBricks: LevelRuntimeHandle['forceClearBreakableBricks'] = () => {
        clearActiveHazards();
        let removed = 0;
        const bodies = Array.from(brickHealth.keys());
        bodies.forEach((body) => {
            const metadata = brickMetadata.get(body);
            if (metadata?.breakable === false) {
                return;
            }
            const visual = visualBodies.get(body);
            const state = brickVisualState.get(body);
            if (visual instanceof Sprite && state?.hpLabel) {
                removeHpLabel(visual, state.hpLabel);
                state.hpLabel = null;
                state.hasHpLabel = false;
            }
            clearGhostEffect(body);
            physics.remove(body);
            removeBodyVisual(body);
            brickHealth.delete(body);
            brickMetadata.delete(body);
            brickVisualState.delete(body);
            removed += 1;
        });
        return removed;
    };

    const applyGhostBrickReward: LevelRuntimeHandle['applyGhostBrickReward'] = (duration, count) => {
        resetGhostBricks();

        if (count <= 0) {
            return;
        }

        const bricks = Array.from(brickHealth.keys()).filter((body) => {
            if (body.label !== 'brick') {
                return false;
            }
            const metadata = brickMetadata.get(body);
            return metadata?.breakable !== false;
        });
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
        setRowColors: applyRowColors,
        updateBrickLighting,
        updateBrickDamage,
        spawnPowerUp,
        findPowerUp,
        removePowerUp,
        clearActivePowerUps,
        spawnCoin,
        findCoin,
        removeCoin,
        clearActiveCoins,
        clearActiveHazards,
        getActiveHazards,
        findHazard,
        resetGhostBricks,
        clearGhostEffect,
        applyGhostBrickReward,
        updateGhostBricks,
        getGhostBrickRemainingDuration,
        forceClearBreakableBricks,
    } satisfies LevelRuntimeHandle;
};
