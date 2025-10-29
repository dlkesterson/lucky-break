import type { GameConfig } from 'config/game';
import type { PhysicsWorldHandle } from 'physics/world';
import type { GameplayRuntimeState } from './types';

export interface RuntimeModifierSnapshot {
    readonly gravity: number;
    readonly restitution: number;
    readonly paddleWidthMultiplier: number;
    readonly speedGovernorMultiplier: number;
}

export interface RuntimeModifiers {
    getState(): RuntimeModifierSnapshot;
    setGravity(value: number): boolean;
    setRestitution(value: number): boolean;
    setPaddleWidthMultiplier(multiplier: number): boolean;
    setSpeedGovernorMultiplier(multiplier: number): boolean;
    reset(): void;
}

export interface RuntimeModifiersDeps {
    readonly config: GameConfig['modifiers'];
    readonly physics: Pick<PhysicsWorldHandle, 'setGravity'>;
    readonly runtimeState: Pick<
        GameplayRuntimeState,
        'gravity' | 'ballRestitution' | 'paddleBaseWidth' | 'speedGovernorMultiplier'
    >;
    readonly baseValues: {
        readonly paddleWidth: number;
    };
    readonly applyRestitution: (value: number) => void;
    readonly applyPaddleBaseWidth: (width: number) => void;
    readonly onSpeedGovernorChange?: (multiplier: number) => void;
}

const quantizeToStep = (value: number, range: { min: number; max: number; step: number }): number => {
    const clamped = Math.min(range.max, Math.max(range.min, value));
    if (!(range.step > 0)) {
        return clamped;
    }
    const steps = Math.round((clamped - range.min) / range.step);
    const snapped = range.min + steps * range.step;
    return Number(snapped.toFixed(6));
};

export const createRuntimeModifiers = ({
    config,
    physics,
    runtimeState,
    baseValues,
    applyRestitution,
    applyPaddleBaseWidth,
    onSpeedGovernorChange,
}: RuntimeModifiersDeps): RuntimeModifiers => {
    const setGravity: RuntimeModifiers['setGravity'] = (value) => {
        const next = quantizeToStep(value, config.gravity);
        if (next === runtimeState.gravity) {
            return false;
        }
        runtimeState.gravity = next;
        physics.setGravity(next);
        return true;
    };

    const setRestitution: RuntimeModifiers['setRestitution'] = (value) => {
        const next = quantizeToStep(value, config.restitution);
        if (next === runtimeState.ballRestitution) {
            return false;
        }
        runtimeState.ballRestitution = next;
        applyRestitution(next);
        return true;
    };

    const setPaddleWidthMultiplier: RuntimeModifiers['setPaddleWidthMultiplier'] = (multiplier) => {
        const next = quantizeToStep(multiplier, config.paddleWidth);
        const targetWidth = baseValues.paddleWidth * next;
        if (Math.abs(runtimeState.paddleBaseWidth - targetWidth) <= 1e-6) {
            return false;
        }
        runtimeState.paddleBaseWidth = targetWidth;
        applyPaddleBaseWidth(targetWidth);
        return true;
    };

    const setSpeedGovernorMultiplier: RuntimeModifiers['setSpeedGovernorMultiplier'] = (multiplier) => {
        const next = quantizeToStep(multiplier, config.speedGovernor);
        if (next === runtimeState.speedGovernorMultiplier) {
            return false;
        }
        runtimeState.speedGovernorMultiplier = next;
        onSpeedGovernorChange?.(next);
        return true;
    };

    const reset: RuntimeModifiers['reset'] = () => {
        runtimeState.gravity = quantizeToStep(config.gravity.default, config.gravity);
        runtimeState.ballRestitution = quantizeToStep(config.restitution.default, config.restitution);
        runtimeState.paddleBaseWidth = baseValues.paddleWidth * quantizeToStep(config.paddleWidth.default, config.paddleWidth);
        runtimeState.speedGovernorMultiplier = quantizeToStep(config.speedGovernor.default, config.speedGovernor);

        physics.setGravity(runtimeState.gravity);
        applyRestitution(runtimeState.ballRestitution);
        applyPaddleBaseWidth(runtimeState.paddleBaseWidth);
        onSpeedGovernorChange?.(runtimeState.speedGovernorMultiplier);
    };

    const getState: RuntimeModifiers['getState'] = () => ({
        gravity: runtimeState.gravity,
        restitution: runtimeState.ballRestitution,
        paddleWidthMultiplier: runtimeState.paddleBaseWidth / baseValues.paddleWidth,
        speedGovernorMultiplier: runtimeState.speedGovernorMultiplier,
    });

    return {
        getState,
        setGravity,
        setRestitution,
        setPaddleWidthMultiplier,
        setSpeedGovernorMultiplier,
        reset,
    } satisfies RuntimeModifiers;
};
