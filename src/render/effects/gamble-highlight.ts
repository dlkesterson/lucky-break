import { GlowFilter } from '@pixi/filter-glow';
import type { Container, Filter } from 'pixi.js';
import { clampUnit } from 'util/math';

type HighlightState = 'armed' | 'primed';

type FilterHost = Container;

interface HighlightEntry {
    readonly target: FilterHost;
    readonly filter: GlowFilter;
    state: HighlightState;
    urgency: number;
}

export interface GambleHighlightEffect {
    apply(target: FilterHost, state: HighlightState, urgency?: number): void;
    reset(target: FilterHost): void;
    update(deltaSeconds: number): void;
    dispose(): void;
}

const ARMED_COLOR = 0x4ec7ff;
const PRIMED_COLOR = 0xff6834;
const BASE_DISTANCE = 12;
const PRIMED_DISTANCE = 18;

const ensureFilterHost = (target: FilterHost): FilterHost => target;

const attachFilter = (target: FilterHost, filter: GlowFilter): void => {
    const host = ensureFilterHost(target);
    const existing = host.filters ?? [];
    if (existing.includes(filter as unknown as Filter)) {
        return;
    }
    host.filters = [...existing, filter as unknown as Filter];
};

const detachFilter = (target: FilterHost, filter: GlowFilter): void => {
    const host = ensureFilterHost(target);
    const existing = host.filters ?? [];
    if (existing.length === 0) {
        return;
    }
    const next = existing.filter((entry: Filter) => entry !== (filter as unknown as Filter));
    host.filters = next.length > 0 ? next : null;
};

export const createGambleHighlightEffect = (): GambleHighlightEffect => {
    const entries = new Map<FilterHost, HighlightEntry>();
    let pulseClock = 0;

    const apply: GambleHighlightEffect['apply'] = (target, state, urgency = 0) => {
        const normalizedUrgency = clampUnit(urgency);
        const host = ensureFilterHost(target);
        let entry = entries.get(host);
        if (!entry) {
            const filter = new GlowFilter({
                distance: state === 'primed' ? PRIMED_DISTANCE : BASE_DISTANCE,
                outerStrength: state === 'primed' ? 1.6 : 0.7,
                innerStrength: state === 'primed' ? 0.25 : 0.05,
                color: state === 'primed' ? PRIMED_COLOR : ARMED_COLOR,
                quality: 0.3,
            });
            filter.enabled = true;
            filter.padding = 12;
            entry = {
                target: host,
                filter,
                state,
                urgency: normalizedUrgency,
            } satisfies HighlightEntry;
            entries.set(host, entry);
            attachFilter(host, filter);
            return;
        }

        if (entry.state !== state) {
            entry.state = state;
            entry.filter.color = state === 'primed' ? PRIMED_COLOR : ARMED_COLOR;
            entry.filter.innerStrength = state === 'primed' ? 0.25 : 0.05;
        }
        entry.urgency = normalizedUrgency;
        attachFilter(host, entry.filter);
        entry.filter.enabled = true;
    };

    const reset: GambleHighlightEffect['reset'] = (target) => {
        const host = ensureFilterHost(target);
        const entry = entries.get(host);
        if (!entry) {
            return;
        }
        detachFilter(host, entry.filter);
        entry.filter.enabled = false;
        entry.filter.outerStrength = 0;
        entry.urgency = 0;
        entries.delete(host);
        entry.filter.destroy();
    };

    const update: GambleHighlightEffect['update'] = (deltaSeconds) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || entries.size === 0) {
            return;
        }
        pulseClock += deltaSeconds;
        const armedCycle = 2.5;
        const primedCycle = 5.4;

        entries.forEach((entry) => {
            const cycle = entry.state === 'primed' ? primedCycle : armedCycle;
            const oscillation = 0.5 + Math.sin(pulseClock * cycle) * 0.5;
            const baseStrength = entry.state === 'primed' ? 1.4 : 0.55;
            const pulseStrength = entry.state === 'primed' ? 1.6 : 0.8;
            const urgencyBoost = entry.state === 'primed' ? 1.2 * entry.urgency : 0.35 * entry.urgency;
            entry.filter.outerStrength = baseStrength + pulseStrength * oscillation + urgencyBoost;
            entry.filter.innerStrength = entry.state === 'primed'
                ? 0.25 + 0.45 * (0.4 * oscillation + entry.urgency)
                : 0.08 + 0.2 * oscillation;
        });
    };

    const dispose: GambleHighlightEffect['dispose'] = () => {
        entries.forEach((entry, host) => {
            detachFilter(host, entry.filter);
            entry.filter.destroy();
        });
        entries.clear();
    };

    return {
        apply,
        reset,
        update,
        dispose,
    } satisfies GambleHighlightEffect;
};
