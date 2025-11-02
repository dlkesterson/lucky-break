import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Sprite, type Container } from 'pixi.js';
import type { MatterBody as Body } from 'physics/matter';
import type { BrickSpec, BrickTrait } from 'util/levels';
import { createGambleRuntime } from 'app/runtime/gamble';
import type { GambleHighlightEffect } from 'render/effects';

const createBrick = (id: number): Body => ({
    id,
    label: 'brick',
} as unknown as Body);

const createMetadata = (traits?: readonly BrickTrait[]): BrickSpec => ({
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    hp: 1,
    traits,
});

describe('createGambleRuntime', () => {
    const managerOptions = {
        timerSeconds: 2,
        rewardMultiplier: 3,
        primeResetHp: 5,
        failPenaltyHp: 4,
    } as const;

    let highlight: GambleHighlightEffect;
    let visualBodies: Map<Body, Container>;
    let brickMetadata: Map<Body, BrickSpec | undefined>;
    let brickHealth: Map<Body, number>;
    let brickVisualState: Map<Body, { maxHp: number; isBreakable: boolean }>;
    let midiTrigger: ReturnType<typeof vi.fn>;
    let musicTrigger: ReturnType<typeof vi.fn>;
    let updateBrickDamage: ReturnType<typeof vi.fn>;
    let highlightApply: ReturnType<typeof vi.fn>;
    let highlightReset: ReturnType<typeof vi.fn>;
    let highlightUpdate: ReturnType<typeof vi.fn>;
    let highlightDispose: ReturnType<typeof vi.fn>;

    const getMidiEngine = () => ({ triggerGambleCountdown: midiTrigger });

    const createRuntime = () => createGambleRuntime({
        managerOptions,
        countdownAudioThreshold: 2,
        tintArmed: 0x123456,
        tintPrimed: 0xabcdef,
        visualBodies,
        brickMetadata,
        brickHealth,
        brickVisualState,
        maxBrickHp: 10,
        updateBrickDamage,
        getMidiEngine,
        musicDirector: { triggerGambleCountdown: musicTrigger },
        highlightFactory: () => highlight,
    });

    beforeEach(() => {
        highlightApply = vi.fn();
        highlightReset = vi.fn();
        highlightUpdate = vi.fn();
        highlightDispose = vi.fn();
        highlight = {
            apply: highlightApply,
            reset: highlightReset,
            update: highlightUpdate,
            dispose: highlightDispose,
        } satisfies GambleHighlightEffect;
        visualBodies = new Map();
        brickMetadata = new Map();
        brickHealth = new Map();
        brickVisualState = new Map();
        midiTrigger = vi.fn();
        musicTrigger = vi.fn();
        updateBrickDamage = vi.fn();
    });

    it('registers gamble bricks and applies armed appearance', () => {
        const gambleBrick = createBrick(1);
        const standardBrick = createBrick(2);
        const gambleSprite = new Sprite();
        const standardSprite = new Sprite();

        visualBodies.set(gambleBrick, gambleSprite);
        visualBodies.set(standardBrick, standardSprite);
        brickMetadata.set(gambleBrick, createMetadata(['gamble']));
        brickMetadata.set(standardBrick, createMetadata());
        brickVisualState.set(gambleBrick, { maxHp: 1, isBreakable: true });
        brickVisualState.set(standardBrick, { maxHp: 1, isBreakable: true });

        const runtime = createRuntime();

        runtime.registerBricks();

        expect(runtime.manager.getState(gambleBrick)).toBe('armed');
        expect(runtime.manager.getState(standardBrick)).toBeNull();
        expect(gambleSprite.tint).toBe(0x123456);
        expect(standardSprite.tint).toBe(0xffffff);
        expect(highlightApply).toHaveBeenCalledWith(gambleSprite, 'armed', 0);
    });

    it('ticks primed bricks, emits countdown audio, and applies penalties on expiry', () => {
        const gambleBrick = createBrick(3);
        const gambleSprite = new Sprite();
        visualBodies.set(gambleBrick, gambleSprite);
        brickMetadata.set(gambleBrick, createMetadata(['gamble']));
        brickVisualState.set(gambleBrick, { maxHp: 2, isBreakable: true });
        brickHealth.set(gambleBrick, 2);

        const runtime = createRuntime();
        runtime.registerBricks();
        const primeResult = runtime.manager.onHit(gambleBrick);
        expect(primeResult.type).toBe('prime');

        runtime.applyAppearance(gambleBrick);
        runtime.tick(1);

        expect(midiTrigger).toHaveBeenCalledTimes(1);
        expect(midiTrigger.mock.calls[0][0]).toMatchObject({ second: 1, urgency: expect.any(Number) });
        expect(musicTrigger).toHaveBeenCalledTimes(1);

        runtime.tick(2);

        expect(brickHealth.get(gambleBrick)).toBe(4);
        expect(updateBrickDamage).toHaveBeenCalledWith(gambleBrick, 4);
        expect(highlightReset).toHaveBeenCalledWith(gambleSprite);
        expect(runtime.manager.getState(gambleBrick)).toBeNull();
        expect(gambleSprite.tint).toBe(0xffffff);
    });

    it('clears highlight state when bricks are reset or removed', () => {
        const gambleBrick = createBrick(4);
        const gambleSprite = new Sprite();
        visualBodies.set(gambleBrick, gambleSprite);
        brickMetadata.set(gambleBrick, createMetadata(['gamble']));
        brickVisualState.set(gambleBrick, { maxHp: 3, isBreakable: true });

        const runtime = createRuntime();
        runtime.registerBricks();
        runtime.clearAll();

        expect(runtime.manager.getState(gambleBrick)).toBeNull();
        expect(gambleSprite.tint).toBe(0xffffff);
        expect(highlightReset).toHaveBeenCalledWith(gambleSprite);

        runtime.handleBrickRemoved(gambleBrick, gambleSprite);
        expect(highlightReset).toHaveBeenCalledWith(gambleSprite);
    });
});
