import { clamp, clampUnit } from 'util/math';

export interface ChromaticTrailSample {
    time: number;
    x: number;
    y: number;
}

export interface ChromaticTrailConfig {
    readonly historySeconds: number;
    readonly maxSamples: number;
    readonly minSampleInterval: number;
    readonly followerDecay: number;
    readonly minRadiusScale: number;
    readonly speedAttenuation: number;
}

export interface ChromaticTrailSource {
    id: number;
    position: { x: number; y: number };
    radius: number;
    normalizedSpeed: number;
    isPrimary: boolean;
}

export interface ChromaticTrailManager {
    readonly recordSample: (id: number, time: number, position: { readonly x: number; readonly y: number }) => void;
    readonly getPosition: (id: number, targetTime: number) => { x: number; y: number } | null;
    readonly getSpeed: (id: number, targetTime: number, fallback: number) => number;
    readonly pruneHistory: (activeIds: Set<number>, referenceTime: number) => void;
    readonly resolveFollowerCount: (comboCount: number, comboEnergy: number) => number;
    readonly resolveFollowerLag: (comboEnergy: number) => number;
    readonly buildSources: (params: {
        ballRadius: number;
        comboScore: number;
        comboEnergy: number;
        sessionTime: number;
        deltaSeconds: number;
        activeBalls: {
            id: number;
            position: { x: number; y: number };
            speed: number;
            maxSpeed: number;
            isPrimary: boolean;
        }[];
    }) => ChromaticTrailSource[];
}

const DEFAULT_CONFIG: ChromaticTrailConfig = {
    historySeconds: 2.2,
    maxSamples: 120,
    minSampleInterval: 0.008,
    followerDecay: 0.18,
    minRadiusScale: 0.42,
    speedAttenuation: 0.16,
};

export const createChromaticTrailManager = (config: Partial<ChromaticTrailConfig> = {}): ChromaticTrailManager => {
    const finalConfig: ChromaticTrailConfig = { ...DEFAULT_CONFIG, ...config };
    const history = new Map<number, ChromaticTrailSample[]>();

    const getOrCreateHistory = (id: number): ChromaticTrailSample[] => {
        let samples = history.get(id);
        if (!samples) {
            samples = [];
            history.set(id, samples);
        }
        return samples;
    };

    const recordSample = (id: number, time: number, position: { readonly x: number; readonly y: number }): void => {
        const samples = getOrCreateHistory(id);
        const lastSample = samples.at(-1);
        if (lastSample && time - lastSample.time < finalConfig.minSampleInterval) {
            return;
        }
        const cutoff = time - finalConfig.historySeconds;
        samples.push({ time, x: position.x, y: position.y });
        while (samples.length > finalConfig.maxSamples) {
            samples.shift();
        }
        while (samples.length > 0 && samples[0].time < cutoff) {
            samples.shift();
        }
    };

    const getPosition = (id: number, targetTime: number): { x: number; y: number } | null => {
        const samples = history.get(id);
        if (!samples?.length) {
            return null;
        }
        const first = samples[0];
        const last = samples.at(-1)!;

        if (targetTime <= first.time) {
            return { x: first.x, y: first.y };
        }
        if (targetTime >= last.time) {
            return { x: last.x, y: last.y };
        }
        for (let i = 1; i < samples.length; i += 1) {
            if (samples[i].time >= targetTime) {
                const prev = samples[i - 1];
                const next = samples[i];
                const dt = next.time - prev.time;
                if (dt <= 0) {
                    return { x: prev.x, y: prev.y };
                }
                const t = (targetTime - prev.time) / dt;
                const x = prev.x + (next.x - prev.x) * t;
                const y = prev.y + (next.y - prev.y) * t;
                return { x, y };
            }
        }
        return null;
    };

    const getSpeed = (id: number, targetTime: number, fallback: number): number => {
        const samples = history.get(id);
        if (!samples || samples.length < 2) {
            return fallback;
        }
        let beforeIndex = -1;
        for (let i = 0; i < samples.length; i += 1) {
            if (samples[i].time >= targetTime) {
                beforeIndex = i - 1;
                break;
            }
        }
        if (beforeIndex < 0) {
            beforeIndex = samples.length - 2;
        }
        beforeIndex = clamp(beforeIndex, 0, samples.length - 2);
        const prev = samples[beforeIndex];
        const next = samples[beforeIndex + 1];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const dt = next.time - prev.time;
        if (dt <= 0) {
            return fallback;
        }
        return distance / dt;
    };

    const pruneHistory = (activeIds: Set<number>, referenceTime: number): void => {
        const cutoff = referenceTime - finalConfig.historySeconds;
        for (const [id, samples] of history.entries()) {
            if (!activeIds.has(id)) {
                history.delete(id);
                continue;
            }
            while (samples.length > 0 && samples[0].time < cutoff) {
                samples.shift();
            }
        }
    };

    const resolveFollowerCount = (comboCount: number, comboEnergy: number): number => {
        const baseFollowers = Math.floor(comboCount / 3);
        const energyBoost = comboEnergy > 0.6 ? 1 : 0;
        const highComboBoost = comboCount >= 10 ? 1 : 0;
        return clamp(baseFollowers + energyBoost + highComboBoost, 0, 6);
    };

    const resolveFollowerLag = (comboEnergy: number): number => {
        return 0.15 + comboEnergy * 0.25;
    };

    const buildSources = (params: {
        ballRadius: number;
        comboScore: number;
        comboEnergy: number;
        sessionTime: number;
        deltaSeconds: number;
        activeBalls: {
            id: number;
            position: { x: number; y: number };
            speed: number;
            maxSpeed: number;
            isPrimary: boolean;
        }[];
    }): ChromaticTrailSource[] => {
        const sources: ChromaticTrailSource[] = [];
        const activeBallIds = new Set<number>();
        const sampleTime = params.sessionTime + params.deltaSeconds;
        const followerCount = resolveFollowerCount(params.comboScore, params.comboEnergy);
        const baseLag = resolveFollowerLag(params.comboEnergy);

        for (const ballData of params.activeBalls) {
            activeBallIds.add(ballData.id);
            const normalizedSpeed = clampUnit(ballData.speed / Math.max(1, ballData.maxSpeed));

            recordSample(ballData.id, sampleTime, ballData.position);

            sources.push({
                id: (ballData.id << 3) | 0,
                position: { x: ballData.position.x, y: ballData.position.y },
                radius: params.ballRadius,
                normalizedSpeed,
                isPrimary: ballData.isPrimary,
            });

            if (followerCount <= 0) {
                continue;
            }

            for (let followerIndex = 1; followerIndex <= followerCount; followerIndex += 1) {
                const lagSeconds = baseLag * followerIndex;
                const followerTime = sampleTime - lagSeconds;
                const followerPosition = getPosition(ballData.id, followerTime);
                if (!followerPosition) {
                    continue;
                }
                const historySpeed = getSpeed(ballData.id, followerTime, normalizedSpeed);
                const radiusScale = Math.max(
                    finalConfig.minRadiusScale,
                    1 - finalConfig.followerDecay * followerIndex,
                );
                const attenuatedSpeed = clamp(
                    historySpeed * (1 - finalConfig.speedAttenuation * followerIndex),
                    0.2,
                    1,
                );
                sources.push({
                    id: (ballData.id << 3) | followerIndex,
                    position: followerPosition,
                    radius: params.ballRadius * radiusScale,
                    normalizedSpeed: attenuatedSpeed,
                    isPrimary: false,
                });
            }
        }

        pruneHistory(activeBallIds, sampleTime);

        return sources;
    };

    return {
        recordSample,
        getPosition,
        getSpeed,
        pruneHistory,
        resolveFollowerCount,
        resolveFollowerLag,
        buildSources,
    };
};
