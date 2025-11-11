import type { BiasPhaseSessionSummary } from 'scenes/bias-phase';
import { clampUnit } from 'util/math';

const trimTrailingZeros = (value: string): string =>
    value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

export const formatNumber = (value: number): string => value.toLocaleString();

export const formatSignedDelta = (value: number, decimals = 2): string => {
    if (!Number.isFinite(value)) {
        return '+/-0';
    }
    const threshold = 10 ** -decimals;
    if (Math.abs(value) < threshold) {
        return '+/-0';
    }
    const formatted = trimTrailingZeros(Math.abs(value).toFixed(decimals));
    return value > 0 ? `+${formatted}` : `-${formatted}`;
};

export const formatDuration = (milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatPercentage = (value: number): string => {
    if (!Number.isFinite(value)) {
        return '0%';
    }

    return `${Math.round(clampUnit(value) * 100)}%`;
};

export const formatGravityBias = (session: BiasPhaseSessionSummary): string => {
    const value = trimTrailingZeros(session.gravity.toFixed(2));
    const delta = formatSignedDelta(session.gravityDelta, 2);
    return `${value}g (${delta})`;
};

export const formatSpeedBias = (session: BiasPhaseSessionSummary): string => {
    const value = trimTrailingZeros(session.speedGovernor.toFixed(2));
    const delta = formatSignedDelta(session.speedDelta, 2);
    return `${value}x (${delta})`;
};
