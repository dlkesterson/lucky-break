import type { GameConfig } from 'config/game';
import type { PhysicsWorldHandle } from 'physics/world';
import type { GameplayRuntimeState } from './types';

export interface RuntimeRuleSnapshot {
    readonly coinsAlwaysDrop: boolean;
    readonly gambleBricksMoreLikely: boolean;
}

export interface RuntimeModifierSnapshot {
    readonly gravity: number;
    readonly restitution: number;
    readonly paddleWidthMultiplier: number;
    readonly speedGovernorMultiplier: number;
    readonly rules: RuntimeRuleSnapshot;
}

export interface RuntimeModifiers {
    getState(): RuntimeModifierSnapshot;
    setGravity(value: number): boolean;
    setRestitution(value: number): boolean;
    setPaddleWidthMultiplier(multiplier: number): boolean;
    setSpeedGovernorMultiplier(multiplier: number): boolean;
    setRules(rules: Partial<RuntimeRuleSnapshot> | null): void;
    getRules(): RuntimeRuleSnapshot;
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
    let currentRules: RuntimeRuleSnapshot = {
        coinsAlwaysDrop: false,
        gambleBricksMoreLikely: false,
    } satisfies RuntimeRuleSnapshot;

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

    const setRules: RuntimeModifiers['setRules'] = (rules) => {
        if (!rules) {
            currentRules = {
                coinsAlwaysDrop: false,
                gambleBricksMoreLikely: false,
            } satisfies RuntimeRuleSnapshot;
            return;
        }

        currentRules = {
            coinsAlwaysDrop: rules.coinsAlwaysDrop === true,
            gambleBricksMoreLikely: rules.gambleBricksMoreLikely === true,
        } satisfies RuntimeRuleSnapshot;
    };

    const getRules: RuntimeModifiers['getRules'] = () => ({ ...currentRules } satisfies RuntimeRuleSnapshot);

    const reset: RuntimeModifiers['reset'] = () => {
        runtimeState.gravity = quantizeToStep(config.gravity.default, config.gravity);
        runtimeState.ballRestitution = quantizeToStep(config.restitution.default, config.restitution);
        runtimeState.paddleBaseWidth = baseValues.paddleWidth * quantizeToStep(config.paddleWidth.default, config.paddleWidth);
        runtimeState.speedGovernorMultiplier = quantizeToStep(config.speedGovernor.default, config.speedGovernor);
        currentRules = {
            coinsAlwaysDrop: false,
            gambleBricksMoreLikely: false,
        } satisfies RuntimeRuleSnapshot;

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
        rules: { ...currentRules } satisfies RuntimeRuleSnapshot,
    });

    return {
        getState,
        setGravity,
        setRestitution,
        setPaddleWidthMultiplier,
        setSpeedGovernorMultiplier,
        setRules,
        getRules,
        reset,
    } satisfies RuntimeModifiers;
};
