import { createRandomManager } from 'util/random';
import type { BiasOptionRisk } from './round-machine';

export const NEBULA_SLOT_SYMBOLS = ['STAR', '777', 'TILT', 'LOCK', 'LUCK', 'VOID', 'GLIM'] as const;
export type NebulaSlotSymbol = (typeof NEBULA_SLOT_SYMBOLS)[number];
export type NebulaSlotRarity = 'miss' | 'tease' | 'bias' | 'jackpot';

export const NEBULA_SLOTS_SPIN_COST = 2;

const RISK_SYMBOL_MAP: Partial<Record<NebulaSlotSymbol, BiasOptionRisk>> = {
    STAR: 'tilt',
    TILT: 'tilt',
    LOCK: 'lock',
    LUCK: 'lock',
    '777': 'reforge',
    GLIM: 'reforge',
};

const RISK_LABEL: Record<BiasOptionRisk, string> = {
    tilt: 'Tilt',
    lock: 'Lock',
    reforge: 'Reforge',
};

const assertNever = (value: never): never => {
    void value;
    throw new Error('Unhandled rarity encountered while resolving slot copy.');
};

const GOLDEN_RATIO_UINT32 = 0x9e3779b9;
const PRIME_LEVEL = 0x85ebca6b;
const PRIME_ENTROPY = 0xc2b2ae35;

const normalizeSeed = (seed: number): number => {
    if (!Number.isFinite(seed)) {
        return 1;
    }
    const normalized = seed >>> 0;
    return normalized === 0 ? 1 : normalized;
};

const resolveRiskLabel = (risk: BiasOptionRisk | undefined): string => (risk ? RISK_LABEL[risk] ?? 'Unknown' : '');

const createHeadline = (rarity: NebulaSlotRarity, risk?: BiasOptionRisk): string => {
    switch (rarity) {
        case 'jackpot':
            return risk ? `${resolveRiskLabel(risk)} Nebula Jackpot` : 'Nebula Jackpot';
        case 'bias':
            return risk ? `${resolveRiskLabel(risk)} Bias Forecast` : 'Bias Forecast';
        case 'tease':
            return risk ? `${resolveRiskLabel(risk)} Currents Stir` : 'Cosmic Currents Stir';
        case 'miss':
            return 'Void Drift';
    }
    return assertNever(rarity);
};

const createDetail = (rarity: NebulaSlotRarity, risk: BiasOptionRisk | undefined, wildcard: boolean): string => {
    const label = resolveRiskLabel(risk);
    switch (rarity) {
        case 'jackpot':
            return risk
                ? `Three-of-a-kind ignites ${label} dominance. Brace for a volatile volley.`
                : 'Jackpot resonance, but the bias refuses to reveal itself.';
        case 'bias':
            return risk
                ? `Entropy threads align around ${label} tables next round.`
                : 'A strong bias is forming, though its shape remains obscured.';
        case 'tease':
            if (risk) {
                return wildcard
                    ? `Wildcard glim whispers toward ${label} swings.`
                    : `Two reels hum in unison. ${label} odds are warming up.`;
            }
            return wildcard
                ? 'Glim sparks flicker without anchoring a bias.'
                : 'Echoes stir in the nebula, but no lane commits yet.';
        case 'miss':
            return wildcard
                ? 'Wild glim fades before coalescing—no reading this spin.'
                : 'Entropy slips through the void—no glimpse this time.';
    }
    return assertNever(rarity);
};

interface BuildOutcomeParams {
    readonly rarity: NebulaSlotRarity;
    readonly risk?: BiasOptionRisk;
    readonly wildcard: boolean;
    readonly spinIndex: number;
    readonly symbols: readonly NebulaSlotSymbol[];
}

export interface NebulaSlotsSpinOutcome {
    readonly spinIndex: number;
    readonly symbols: readonly NebulaSlotSymbol[];
    readonly rarity: NebulaSlotRarity;
    readonly headline: string;
    readonly detail: string;
    readonly biasRisk?: BiasOptionRisk;
    readonly wildcard: boolean;
}

const buildOutcome = ({ rarity, risk, wildcard, spinIndex, symbols }: BuildOutcomeParams): NebulaSlotsSpinOutcome => ({
    spinIndex,
    symbols,
    rarity,
    headline: createHeadline(rarity, risk),
    detail: createDetail(rarity, risk, wildcard),
    biasRisk: risk,
    wildcard,
});

export const evaluateNebulaSlotSymbols = (
    symbols: readonly NebulaSlotSymbol[],
    spinIndex: number,
): NebulaSlotsSpinOutcome => {
    const counts = new Map<NebulaSlotSymbol, number>();
    for (const symbol of symbols) {
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }

    const wildcard = counts.has('GLIM');
    const entries = Array.from(counts.entries());
    const triple = entries.find(([, count]) => count === 3);
    if (triple) {
        const [symbol] = triple;
        const risk = RISK_SYMBOL_MAP[symbol];
        if (symbol === '777' || symbol === 'GLIM') {
            return buildOutcome({ rarity: 'jackpot', risk: risk ?? 'reforge', wildcard: true, spinIndex, symbols });
        }
        if (risk) {
            return buildOutcome({ rarity: 'bias', risk, wildcard, spinIndex, symbols });
        }
        return buildOutcome({ rarity: 'miss', risk: undefined, wildcard, spinIndex, symbols });
    }

    const doubleEntry = entries.find(([, count]) => count === 2);
    if (doubleEntry) {
        const [pairedSymbol] = doubleEntry;
        const singleEntry = entries.find(([, count]) => count === 1);
        const singleSymbol = singleEntry?.[0];
        const pairedRisk = RISK_SYMBOL_MAP[pairedSymbol];
        const singleRisk = singleSymbol ? RISK_SYMBOL_MAP[singleSymbol] : undefined;

        if (pairedSymbol === '777' && (wildcard || singleSymbol === '777')) {
            return buildOutcome({ rarity: 'jackpot', risk: 'reforge', wildcard: true, spinIndex, symbols });
        }

        if (pairedRisk) {
            const rarity: NebulaSlotRarity = wildcard ? 'bias' : 'tease';
            return buildOutcome({ rarity, risk: pairedRisk, wildcard, spinIndex, symbols });
        }

        if (wildcard && singleRisk) {
            const rarity: NebulaSlotRarity = singleRisk === 'reforge' ? 'jackpot' : 'bias';
            const resolvedRisk: BiasOptionRisk = rarity === 'jackpot' ? 'reforge' : singleRisk;
            return buildOutcome({ rarity, risk: resolvedRisk, wildcard: true, spinIndex, symbols });
        }

        if (wildcard) {
            return buildOutcome({ rarity: 'tease', risk: 'reforge', wildcard: true, spinIndex, symbols });
        }

        return buildOutcome({ rarity: 'miss', risk: undefined, wildcard, spinIndex, symbols });
    }

    if (wildcard) {
        return buildOutcome({ rarity: 'tease', risk: 'reforge', wildcard: true, spinIndex, symbols });
    }

    const ambientRisk = symbols.map((symbol) => RISK_SYMBOL_MAP[symbol]).find((risk): risk is BiasOptionRisk => Boolean(risk));
    if (ambientRisk) {
        return buildOutcome({ rarity: 'tease', risk: ambientRisk, wildcard: false, spinIndex, symbols });
    }

    return buildOutcome({ rarity: 'miss', risk: undefined, wildcard: false, spinIndex, symbols });
};

const computeSpinSeed = (baseSeed: number, spinIndex: number, level: number, entropy: number): number => {
    const normalizedBase = normalizeSeed(baseSeed);
    const resolvedIndex = spinIndex <= 0 ? 1 : spinIndex;
    const indexSalt = ((resolvedIndex + 1) * GOLDEN_RATIO_UINT32) >>> 0;
    const levelSalt = ((Math.max(0, level) + 1) * PRIME_LEVEL) >>> 0;
    const entropySalt = ((Math.max(0, Math.floor(entropy)) + 1) * PRIME_ENTROPY) >>> 0;
    const combined = normalizedBase ^ indexSalt ^ levelSalt ^ entropySalt;
    const normalized = combined >>> 0;
    if (normalized === 0) {
        return normalizedBase ^ PRIME_LEVEL;
    }
    return normalized;
};

export interface NebulaSlotsMachineContext {
    readonly level?: number;
    readonly entropy?: number;
}

export interface NebulaSlotsMachine {
    spin(spinIndex: number): NebulaSlotsSpinOutcome;
}

export const createNebulaSlotsMachine = (
    seed: number,
    context: NebulaSlotsMachineContext = {},
): NebulaSlotsMachine => {
    const baseSeed = normalizeSeed(seed);
    const level = context.level ?? 0;
    const entropy = Number.isFinite(context.entropy) ? Number(context.entropy) : 0;

    return {
        spin(spinIndex: number): NebulaSlotsSpinOutcome {
            const resolvedIndex = spinIndex <= 0 ? 1 : Math.floor(spinIndex);
            const spinSeed = computeSpinSeed(baseSeed, resolvedIndex, level, entropy);
            const rng = createRandomManager(spinSeed);
            const symbols: readonly NebulaSlotSymbol[] = [
                NEBULA_SLOT_SYMBOLS[rng.nextInt(NEBULA_SLOT_SYMBOLS.length)],
                NEBULA_SLOT_SYMBOLS[rng.nextInt(NEBULA_SLOT_SYMBOLS.length)],
                NEBULA_SLOT_SYMBOLS[rng.nextInt(NEBULA_SLOT_SYMBOLS.length)],
            ];
            return evaluateNebulaSlotSymbols(symbols, resolvedIndex);
        },
    };
};
