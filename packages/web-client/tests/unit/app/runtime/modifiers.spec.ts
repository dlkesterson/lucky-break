import { describe, expect, it, vi } from 'vitest';
import { gameConfig } from 'config/game';
import { createRuntimeModifiers } from 'app/runtime/modifiers';

const modifierConfig = gameConfig.modifiers;

describe('createRuntimeModifiers', () => {
    const basePaddleWidth = 100;

    const buildRuntimeState = () => ({
        gravity: modifierConfig.gravity.default,
        ballRestitution: modifierConfig.restitution.default,
        paddleBaseWidth: basePaddleWidth * modifierConfig.paddleWidth.default,
        speedGovernorMultiplier: modifierConfig.speedGovernor.default,
    });

    it('quantizes gravity adjustments to the configured step', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
        });

        const changed = modifiers.setGravity(0.123);

        expect(changed).toBe(true);
        expect(runtimeState.gravity).toBeCloseTo(0.1, 6);
        expect(setGravity).toHaveBeenCalledWith(0.1);
        expect(applyRestitution).not.toHaveBeenCalled();
        expect(applyPaddleWidth).not.toHaveBeenCalled();
    });

    it('updates restitution and applies quantized value', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
        });

        const changed = modifiers.setRestitution(1.111);

        expect(changed).toBe(true);
        expect(runtimeState.ballRestitution).toBeCloseTo(1.11, 6);
        expect(applyRestitution).toHaveBeenCalledWith(1.11);
        expect(setGravity).not.toHaveBeenCalled();
    });

    it('sets paddle width multiplier within the configured bounds', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
        });

        const changed = modifiers.setPaddleWidthMultiplier(1.17);

        expect(changed).toBe(true);
        expect(runtimeState.paddleBaseWidth).toBeCloseTo(115, 6);
        expect(applyPaddleWidth).toHaveBeenCalledTimes(1);
        const lastCall = applyPaddleWidth.mock.calls[applyPaddleWidth.mock.calls.length - 1];
        const [appliedWidth] = lastCall;
        expect(appliedWidth).toBeCloseTo(115, 6);
    });

    it('updates the speed governor multiplier', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();
        const onSpeedGovernorChange = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
            onSpeedGovernorChange,
        });

        const changed = modifiers.setSpeedGovernorMultiplier(1.32);

        expect(changed).toBe(true);
        expect(runtimeState.speedGovernorMultiplier).toBeCloseTo(1.3, 6);
        expect(onSpeedGovernorChange).toHaveBeenCalledWith(1.3);
    });

    it('reset restores defaults and reapplies side effects', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();
        const onSpeedGovernorChange = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
            onSpeedGovernorChange,
        });

        modifiers.setGravity(0.2);
        modifiers.setRestitution(1.05);
        modifiers.setPaddleWidthMultiplier(1.25);
        modifiers.setSpeedGovernorMultiplier(0.9);

        setGravity.mockClear();
        applyRestitution.mockClear();
        applyPaddleWidth.mockClear();
        onSpeedGovernorChange.mockClear();

        modifiers.reset();

        expect(runtimeState.gravity).toBe(modifierConfig.gravity.default);
        expect(runtimeState.ballRestitution).toBe(modifierConfig.restitution.default);
        expect(runtimeState.paddleBaseWidth).toBeCloseTo(
            basePaddleWidth * modifierConfig.paddleWidth.default,
            6,
        );
        expect(runtimeState.speedGovernorMultiplier).toBe(modifierConfig.speedGovernor.default);

        expect(setGravity).toHaveBeenCalledWith(modifierConfig.gravity.default);
        expect(applyRestitution).toHaveBeenCalledWith(modifierConfig.restitution.default);
        expect(applyPaddleWidth).toHaveBeenCalledWith(
            basePaddleWidth * modifierConfig.paddleWidth.default,
        );
        expect(onSpeedGovernorChange).toHaveBeenCalledWith(modifierConfig.speedGovernor.default);
    });

    it('does not trigger updates when values remain unchanged', () => {
        const runtimeState = buildRuntimeState();
        const setGravity = vi.fn();
        const applyRestitution = vi.fn();
        const applyPaddleWidth = vi.fn();
        const onSpeedGovernorChange = vi.fn();

        const modifiers = createRuntimeModifiers({
            config: modifierConfig,
            physics: { setGravity },
            runtimeState,
            baseValues: { paddleWidth: basePaddleWidth },
            applyRestitution,
            applyPaddleBaseWidth: applyPaddleWidth,
            onSpeedGovernorChange,
        });

        expect(modifiers.setGravity(runtimeState.gravity)).toBe(false);
        expect(modifiers.setRestitution(runtimeState.ballRestitution)).toBe(false);
        expect(
            modifiers.setPaddleWidthMultiplier(runtimeState.paddleBaseWidth / basePaddleWidth),
        ).toBe(false);
        expect(modifiers.setSpeedGovernorMultiplier(runtimeState.speedGovernorMultiplier)).toBe(false);

        expect(setGravity).not.toHaveBeenCalled();
        expect(applyRestitution).not.toHaveBeenCalled();
        expect(applyPaddleWidth).not.toHaveBeenCalled();
        expect(onSpeedGovernorChange).not.toHaveBeenCalled();
    });
});
