import { beforeEach, describe, expect, it, vi } from 'vitest';

const brickTextureState = vi.hoisted(() => {
    const brickTextureGetMock = vi.fn();
    const createBrickTextureCacheMock = vi.fn(() => ({
        get: brickTextureGetMock,
    }));
    return { brickTextureGetMock, createBrickTextureCacheMock };
});

vi.mock('render/brick-texture-cache', () => ({
    createBrickTextureCache: brickTextureState.createBrickTextureCacheMock,
}));

vi.mock('pixi.js', () => {
    class MockContainer {
        public children: unknown[] = [];
        public parent: any = null;
        public alpha = 1;
        public blendMode: string | undefined;
        public eventMode: string | undefined;
        public position = {
            x: 0,
            y: 0,
            set: (x: number, y?: number) => {
                this.position.x = x;
                this.position.y = y ?? x;
            },
        };

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: any }).parent = this;
                }
            });
            return items[0];
        }

        removeChild(item: unknown): void {
            const index = this.children.indexOf(item);
            if (index >= 0) {
                this.children.splice(index, 1);
            }
            if (item && typeof item === 'object') {
                (item as { parent?: any }).parent = null;
            }
        }
    }

    class MockGraphics extends MockContainer {
        circle(): this {
            return this;
        }

        fill(): this {
            return this;
        }
    }

    class MockSprite extends MockContainer {
        public anchor = {
            x: 0,
            y: 0,
            set: (x: number, y?: number) => {
                this.anchor.x = x;
                this.anchor.y = y ?? x;
            },
        };
        public tint = 0xffffff;

        public constructor(public texture: unknown) {
            super();
        }
    }

    return {
        Container: MockContainer,
        Graphics: MockGraphics,
        Sprite: MockSprite,
    };
});

const matterState = vi.hoisted(() => {
    let nextId = 1;
    const setVelocityMock = vi.fn((body: any, velocity: { x: number; y: number }) => {
        body.velocity = velocity;
    });
    const circleMock = vi.fn((x: number, y: number, radius: number, options: any = {}) => ({
        id: nextId++,
        label: options.label ?? 'circle',
        position: { x, y },
        radius,
        isSensor: options.isSensor ?? false,
    }));
    return {
        setVelocityMock,
        circleMock,
        reset() {
            nextId = 1;
            setVelocityMock.mockClear();
            circleMock.mockClear();
        },
    };
});

vi.mock('matter-js', () => ({
    Body: { setVelocity: matterState.setVelocityMock },
    Bodies: { circle: matterState.circleMock },
}));

const distanceMock = vi.hoisted(() =>
    vi.fn((lhs: { x: number; y: number }, rhs: { x: number; y: number }) => {
        const dx = lhs.x - rhs.x;
        const dy = lhs.y - rhs.y;
        return Math.hypot(dx, dy);
    }),
);

vi.mock('util/geometry', () => ({
    distance: distanceMock,
}));

const levelMocks = vi.hoisted(() => ({
    generateLevelLayoutMock: vi.fn(),
    getLevelSpecMock: vi.fn(),
    getPresetLevelCountMock: vi.fn(),
    getLevelDifficultyMultiplierMock: vi.fn(),
    getLoopScalingInfoMock: vi.fn(() => ({
        loopCount: 0,
        speedMultiplier: 1,
        brickHpMultiplier: 1,
        brickHpBonus: 0,
        powerUpChanceMultiplier: 1,
        gapScale: 1,
        fortifiedChance: 0,
        voidColumnChance: 0,
        centerFortifiedBias: 0,
    })),
    remixLevelMock: vi.fn((spec: unknown, loopCount: number) => {
        void loopCount;
        return spec;
    }),
}));

vi.mock('util/levels', () => ({
    generateLevelLayout: levelMocks.generateLevelLayoutMock,
    getLevelSpec: levelMocks.getLevelSpecMock,
    getPresetLevelCount: levelMocks.getPresetLevelCountMock,
    getLevelDifficultyMultiplier: levelMocks.getLevelDifficultyMultiplierMock,
    getLoopScalingInfo: levelMocks.getLoopScalingInfoMock,
    remixLevel: levelMocks.remixLevelMock,
}));

const {
    generateLevelLayoutMock,
    getLevelSpecMock,
    getPresetLevelCountMock,
    getLevelDifficultyMultiplierMock,
    remixLevelMock,
} = levelMocks;

const { brickTextureGetMock, createBrickTextureCacheMock } = brickTextureState;

import { createLevelRuntime } from 'app/level-runtime';
import type { PowerUpType } from 'util/power-ups';
import type { PhysicsWorldHandle } from 'physics/world';

const createStage = () => {
    const makeLayer = () => {
        const layer = {
            children: [] as any[],
            addChild: vi.fn((...items: any[]) => {
                layer.children.push(...items);
                items.forEach((item) => {
                    if (item && typeof item === 'object') {
                        (item as { parent?: any }).parent = layer;
                    }
                });
                return items[0];
            }),
            removeChild: vi.fn((item: any) => {
                const index = layer.children.indexOf(item);
                if (index >= 0) {
                    layer.children.splice(index, 1);
                }
                if (item && typeof item === 'object') {
                    (item as { parent?: any }).parent = null;
                }
            }),
        };
        return layer;
    };

    const layers: Record<string, ReturnType<typeof makeLayer>> = {
        playfield: makeLayer(),
        effects: makeLayer(),
    };

    return {
        app: { renderer: {} },
        layers,
        addToLayer: (name: string, item: unknown) => {
            if (!layers[name]) {
                layers[name] = makeLayer();
            }
            layers[name].addChild(item);
        },
    };
};

const createPhysics = () => {
    let nextIdValue = 100;
    return {
        factory: {
            brick: vi.fn(({ position }: { position: { x: number; y: number } }) => ({
                id: nextIdValue++,
                label: 'brick',
                position: { ...position },
                isSensor: false,
            })),
        },
        add: vi.fn(),
        remove: vi.fn(),
    };
};

interface TestLayout {
    bricks: { row: number; col: number; x: number; y: number; hp: number }[];
    breakableCount: number;
    spec: { powerUpChanceMultiplier?: number };
}

const createRuntime = (options: {
    layout: TestLayout;
    levelSpec?: unknown;
    presetCount?: number;
    difficulty?: number;
    playfieldWidth?: number;
}) => {
    const {
        layout,
        levelSpec = { powerUpChanceMultiplier: 1.2 },
        presetCount = 5,
        difficulty = 1.3,
        playfieldWidth = 320,
    } = options;

    getPresetLevelCountMock.mockReturnValue(presetCount);
    getLevelSpecMock.mockReturnValue(levelSpec);
    generateLevelLayoutMock.mockReturnValue(layout);
    getLevelDifficultyMultiplierMock.mockReturnValue(difficulty);

    const physics = createPhysics();
    const stage = createStage();
    const visualBodies = new Map<any, any>();
    const removeBodyVisual = vi.fn((body: any) => {
        const visual = visualBodies.get(body);
        if (visual?.parent?.removeChild) {
            visual.parent.removeChild(visual);
        }
        visualBodies.delete(body);
    });

    const powerUp = { radius: 16, fallSpeed: 6 } as const;
    const coin = { radius: 8, fallSpeed: 5 } as const;
    const runtime = createLevelRuntime({
        physics: physics as unknown as PhysicsWorldHandle,
        stage: stage as any,
        visualBodies,
        removeBodyVisual,
        playfieldWidth,
        brickSize: { width: 60, height: 24 },
        brickLighting: { radius: 120, restAlpha: 0.55 },
        rowColors: [0xff6600, 0x3366ff, 0x11aa55],
        powerUp,
        coin,
    });

    return {
        physics,
        stage,
        visualBodies,
        removeBodyVisual,
        runtime,
    };
};

beforeEach(() => {
    brickTextureGetMock.mockImplementation(({ currentHp }: { currentHp: number }) => `texture-${currentHp}`);
    createBrickTextureCacheMock.mockClear();
    brickTextureGetMock.mockClear();
    matterState.reset();
    distanceMock.mockClear();
    generateLevelLayoutMock.mockClear();
    getLevelSpecMock.mockClear();
    getPresetLevelCountMock.mockClear();
    getLevelDifficultyMultiplierMock.mockClear();
    remixLevelMock.mockClear();
});

describe('createLevelRuntime', () => {
    it('loads bricks, tracks state, and updates visuals', () => {
        const layout = {
            bricks: [
                { row: 0, col: 0, x: 150, y: 120, hp: 3 },
                { row: 1, col: 1, x: 210, y: 180, hp: 2 },
            ],
            breakableCount: 2,
            spec: { powerUpChanceMultiplier: 1.4 },
        };

        const { runtime, physics, stage, visualBodies } = createRuntime({ layout, levelSpec: { powerUpChanceMultiplier: 1.4 } });
        const result = runtime.loadLevel(0);

        expect(physics.factory.brick).toHaveBeenCalledTimes(2);
        expect(stage.layers.playfield.addChild).toHaveBeenCalledTimes(2);
        expect(result.breakableBricks).toBe(2);
        expect(result.powerUpChanceMultiplier).toBe(1.4);
        expect(result.difficultyMultiplier).toBeCloseTo(1.3);
        expect(result.layoutBounds).toEqual({
            minX: 120,
            maxX: 240,
            minY: 108,
            maxY: 192,
        });

        const [firstEntry] = Array.from(visualBodies.entries());
        const [firstBody, firstVisual] = firstEntry;

        runtime.updateBrickLighting(firstBody.position);
        expect(firstVisual.blendMode).toBe('add');
        expect(firstVisual.alpha).toBeGreaterThan(0.55);
        runtime.updateBrickLighting({ x: firstBody.position.x + 1000, y: firstBody.position.y + 1000 });
        expect(firstVisual.tint).toBe(0xffffff);
        expect(firstVisual.blendMode).toBe('normal');

        brickTextureGetMock.mockClear();
        runtime.updateBrickDamage(firstBody, 0.4);
        expect(brickTextureGetMock).toHaveBeenCalledWith(
            expect.objectContaining({ currentHp: 0, maxHp: 3 }),
        );
        expect(firstVisual.texture).toBe('texture-0');
    });

    it('refreshes brick textures when row colors change', () => {
        const layout = {
            bricks: [
                { row: 0, col: 0, x: 150, y: 120, hp: 3 },
                { row: 1, col: 1, x: 210, y: 180, hp: 2 },
            ],
            breakableCount: 2,
            spec: { powerUpChanceMultiplier: 1.2 },
        };

        const { runtime, visualBodies } = createRuntime({ layout });
        runtime.loadLevel(0);

        const [firstBody, firstVisual] = Array.from(visualBodies.entries())[0];
        expect(firstBody).toBeDefined();
        expect(firstVisual).toBeDefined();

        brickTextureGetMock.mockClear();
        runtime.setRowColors([0x112233, 0x445566, 0x778899]);

        expect(brickTextureGetMock).toHaveBeenCalledWith(
            expect.objectContaining({ baseColor: 0x112233 }),
        );
        const state = runtime.brickVisualState.get(firstBody);
        expect(state?.baseColor).toBe(0x112233);
        expect(firstVisual.texture).toBe('texture-3');
    });

    it('applies power-up lifecycle helpers', () => {
        const layout = {
            bricks: [
                { row: 0, col: 0, x: 150, y: 120, hp: 2 },
            ],
            breakableCount: 1,
            spec: { powerUpChanceMultiplier: 1 },
        };

        const { runtime, physics, stage, visualBodies } = createRuntime({ layout });
        runtime.loadLevel(0);

        runtime.spawnPowerUp('multi-ball' as PowerUpType, { x: 300, y: 220 });
        expect(matterState.circleMock).toHaveBeenCalledWith(300, 220, 16, expect.objectContaining({ label: 'powerup' }));
        expect(matterState.setVelocityMock).toHaveBeenCalledWith(expect.any(Object), { x: 0, y: 6 });
        expect(stage.layers.effects.children).toHaveLength(1);
        const spawnedBody = matterState.circleMock.mock.results.at(-1)?.value;
        expect(runtime.findPowerUp(spawnedBody)).not.toBeNull();
        expect(visualBodies.has(spawnedBody)).toBe(true);

        runtime.removePowerUp({ type: 'multi-ball', body: spawnedBody, visual: visualBodies.get(spawnedBody) });
        expect(physics.remove).toHaveBeenCalledWith(spawnedBody);
        expect(visualBodies.has(spawnedBody)).toBe(false);

        runtime.spawnPowerUp('paddle-width' as PowerUpType, { x: 10, y: 40 });
        runtime.spawnPowerUp('ball-speed' as PowerUpType, { x: 12, y: 44 });
        expect(stage.layers.effects.children).toHaveLength(2);
        runtime.clearActivePowerUps();
        expect(stage.layers.effects.children).toHaveLength(0);
    });

    it('manages ghost brick rewards and timers', () => {
        const layout = {
            bricks: [
                { row: 0, col: 0, x: 120, y: 100, hp: 1 },
                { row: 1, col: 1, x: 180, y: 160, hp: 1 },
            ],
            breakableCount: 2,
            spec: { powerUpChanceMultiplier: 1 },
        };

        const { runtime, visualBodies } = createRuntime({ layout });
        const result = runtime.loadLevel(0);
        expect(result.layoutBounds).not.toBeNull();

        const [firstBody, firstVisual] = Array.from(visualBodies.entries())[0];
        runtime.applyGhostBrickReward(5, 1);
        expect(firstBody.isSensor).toBe(true);
        expect(firstVisual.alpha).toBeCloseTo(0.35);
        expect(runtime.getGhostBrickRemainingDuration()).toBeGreaterThan(0);

        const remaining = runtime.updateGhostBricks(2);
        expect(remaining).toBeGreaterThanOrEqual(0);
        runtime.clearGhostEffect(firstBody);
        expect(firstBody.isSensor).toBe(false);
        expect(firstVisual.alpha).toBeCloseTo(0.55);

        runtime.applyGhostBrickReward(2, 2);
        const afterClear = runtime.updateGhostBricks(3);
        expect(afterClear).toBe(0);
        expect(runtime.getGhostBrickRemainingDuration()).toBe(0);
        runtime.resetGhostBricks();
        expect(runtime.getGhostBrickRemainingDuration()).toBe(0);
    });

    it('handles empty layouts and remixed levels', () => {
        const emptyLayout = {
            bricks: [],
            breakableCount: 0,
            spec: { powerUpChanceMultiplier: 2 },
        };

        const { runtime: emptyRuntime, physics } = createRuntime({ layout: emptyLayout, presetCount: 1 });
        const emptyResult = emptyRuntime.loadLevel(0);
        expect(emptyResult.layoutBounds).toBeNull();
        expect(physics.factory.brick).not.toHaveBeenCalled();

        const populatedLayout = {
            bricks: [{ row: 0, col: 0, x: 100, y: 100, hp: 1 }],
            breakableCount: 1,
            spec: { powerUpChanceMultiplier: 1 },
        };
        remixLevelMock.mockImplementation((spec: unknown, loopCount: number) => {
            if (typeof spec === 'object' && spec !== null) {
                return { ...(spec as Record<string, unknown>), loopCount };
            }
            return { original: spec, loopCount };
        });
        const { runtime: loopRuntime } = createRuntime({
            layout: populatedLayout,
            presetCount: 1,
            levelSpec: { powerUpChanceMultiplier: 1 },
        });
        const loopResult = loopRuntime.loadLevel(3);
        expect(remixLevelMock).toHaveBeenCalledWith(expect.anything(), 3);
        expect(loopResult.powerUpChanceMultiplier).toBe(1);
        expect(loopResult.difficultyMultiplier).toBeCloseTo(1.3);
    });
});
