import { AudioForeshadower, PredictedEvent } from './AudioForeshadower';

export interface ForeshadowerInitOptions {
    readonly scale: readonly number[];
    readonly seed: number;
}

let foreshadower: AudioForeshadower | null = null;

const normalizeScale = (scale: readonly number[]): number[] => {
    const values = Array.from(scale ?? []);
    if (values.length === 0) {
        return values;
    }
    return values
        .map((note) => (Number.isFinite(note) ? Math.round(note) : Number.NaN))
        .filter((note): note is number => Number.isFinite(note));
};

export function initForeshadower(scale: readonly number[], seed: number): AudioForeshadower;
export function initForeshadower(options: ForeshadowerInitOptions): AudioForeshadower;
export function initForeshadower(
    arg1: readonly number[] | ForeshadowerInitOptions,
    arg2?: number,
): AudioForeshadower {
    let options: ForeshadowerInitOptions;
    if (Array.isArray(arg1)) {
        options = {
            scale: normalizeScale(arg1),
            seed: typeof arg2 === 'number' && Number.isFinite(arg2) ? Math.floor(arg2) : 1,
        };
    } else {
        const input = arg1 as ForeshadowerInitOptions;
        options = {
            scale: normalizeScale(input.scale),
            seed: Math.floor(input.seed ?? 1),
        };
    }

    foreshadower?.dispose();
    foreshadower = new AudioForeshadower(options.scale, options.seed);
    return foreshadower;
}

export function scheduleForeshadowEvent(event: PredictedEvent): void {
    foreshadower?.scheduleEvent(event);
}

export function cancelForeshadowEvent(eventId: string): void {
    foreshadower?.cancelEvent(eventId);
}

export function disposeForeshadower(): void {
    foreshadower?.dispose();
    foreshadower = null;
}
