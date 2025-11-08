import { rootLogger, type Logger } from 'util/log';
import { hudSetters, type HudFlavorTone } from '../ui/state/game-bridge';
import {
    introOverlayBridge,
    type IntroSequenceReason,
    type IntroSlideView,
} from '../ui/state/intro-bridge';
import type { LuckyBreakEventBus, EventEnvelope } from 'app/events';
import type { RandomManager } from 'util/random';
import type { IdleSimulationResultSummary } from './runtime/idle';
import { generateFateLedgerIdleNarrative } from './fate-ledger';
import { i18n } from '../i18n';
import introPrologueRaw from '../../assets/narrative/intro/prologue.md?raw';

const INTRO_STORAGE_KEY = 'lucky-break::narrative::intro::v1';
const PADDLE_FLAVOR_COOLDOWN_MS = 2400;
const COMBO_FLAVOR_COOLDOWN_MS = 4400;
const FLAVOR_DURATION_MS = 5200;

const DEFAULT_PADDLE_FLAVOR = 'Nice hit!';
const DEFAULT_COMBO_FLAVOR = 'Combo active!';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface NarrativeServiceOptions {
    readonly bus: LuckyBreakEventBus;
    readonly random: RandomManager;
    readonly logger?: Logger;
    readonly storage?: StorageLike | null;
    readonly now?: () => number;
    readonly isMobile?: boolean;
}

export interface NarrativeService {
    readonly showIntroIfNeeded: () => Promise<boolean>;
    readonly consumeIntroPrologue: () => IntroSlideView | null;
    readonly openIntro: (reason?: IntroSequenceReason) => Promise<void>;
    readonly markIntroSeen: () => void;
    readonly handleIdleResume: (summary: IdleSimulationResultSummary | null) => void;
    readonly dispose: () => void;
}

const resolveStorage = (storage?: StorageLike | null): StorageLike | null => {
    if (storage !== undefined) {
        return storage ?? null;
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (error) {
        void error;
    }
    return null;
};

const parseMarkdownSlide = (raw: string, fallbackId: string): IntroSlideView => {
    const lines = raw.replace(/\r/g, '').split('\n');
    let heading = fallbackId;
    const paragraphs: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
        if (buffer.length === 0) {
            return;
        }
        const merged = buffer.join(' ').trim();
        if (merged.length > 0) {
            paragraphs.push(merged);
        }
        buffer = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            flush();
            continue;
        }
        if (trimmed.startsWith('## ')) {
            flush();
            heading = trimmed.slice(3).trim() || heading;
            continue;
        }
        buffer.push(trimmed);
    }
    flush();

    if (paragraphs.length === 0) {
        paragraphs.push('Fortune favors the bold. Take your opening shot.');
    }

    return {
        id: fallbackId,
        heading,
        body: paragraphs,
    } satisfies IntroSlideView;
};

const selectRandomEntry = <T>(random: RandomManager, items: readonly T[], fallback: T): T => {
    if (items.length === 0) {
        return fallback;
    }
    const index = Math.floor(random.next() * items.length);
    return items[Math.max(0, Math.min(items.length - 1, index))] ?? fallback;
};

const cloneSlide = (slide: IntroSlideView): IntroSlideView => ({
    id: slide.id,
    heading: slide.heading,
    body: [...slide.body],
});

const formatTemplate = (template: string, fields: Record<string, number | string>): string =>
    template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
        const value = fields[key];
        if (value === undefined || value === null) {
            return '';
        }
        return String(value);
    });

const reasonAllowsSkip = (reason: IntroSequenceReason): boolean => reason !== 'first-launch';

const introPrologueSlide = parseMarkdownSlide(introPrologueRaw, 'awakening');

const introSlides: readonly IntroSlideView[] = [introPrologueSlide];

const buildFlavorId = (prefix: string, clock: () => number, random: RandomManager): string => {
    const tick = Math.round(clock());
    const entropy = Math.floor(random.next() * 1_000_000);
    return `${prefix}-${tick.toString(36)}-${entropy.toString(36)}`;
};

const showFlavorMessage = (
    tone: HudFlavorTone,
    text: string,
    options: {
        readonly clock: () => number;
        readonly random: RandomManager;
        readonly durationMs?: number;
    },
): void => {
    if (!text) {
        return;
    }
    const id = buildFlavorId('flavor', options.clock, options.random);
    hudSetters.showFlavor(
        {
            id,
            text,
            tone,
        },
        { durationMs: options.durationMs ?? FLAVOR_DURATION_MS },
    );
};

const toSecondsLabel = (durationMs: number): string => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return '0s';
    }
    const seconds = durationMs / 1000;
    if (seconds >= 90) {
        return `${Math.round(seconds / 60)}m`;
    }
    if (seconds >= 10) {
        return `${Math.round(seconds)}s`;
    }
    return `${seconds.toFixed(1)}s`;
};

export const createNarrativeService = ({
    bus,
    random,
    logger: explicitLogger,
    storage: explicitStorage,
    now,
    isMobile = false,
}: NarrativeServiceOptions): NarrativeService => {
    const logger = explicitLogger ?? rootLogger.child('narrative');
    const clock = now ?? Date.now;
    const storage = resolveStorage(explicitStorage);

    const readIntroSeen = (): boolean => {
        if (!storage) {
            return false;
        }
        try {
            return storage.getItem(INTRO_STORAGE_KEY) === '1';
        } catch (error) {
            logger.warn('Failed to read intro flag', { error });
            return false;
        }
    };

    let introSeen = readIntroSeen();

    const persistIntroSeen = () => {
        if (!storage) {
            return;
        }
        try {
            storage.setItem(INTRO_STORAGE_KEY, '1');
        } catch (error) {
            logger.warn('Failed to persist intro flag', { error });
        }
    };

    const markIntroSeen = () => {
        if (introSeen) {
            return;
        }
        introSeen = true;
        persistIntroSeen();
    };

    const openIntroInternal = (reason: IntroSequenceReason): void => {
        if (introOverlayBridge.isActive()) {
            return;
        }

        const slides = introSlides.map(cloneSlide);
        introOverlayBridge.open({
            slides,
            reason,
            allowSkip: reasonAllowsSkip(reason),
            completionLabel: 'Begin the Wager',
            advanceLabel: 'Continue',
            onComplete: markIntroSeen,
        });
    };

    const consumeIntroPrologue = (): IntroSlideView | null => {
        if (introSeen) {
            return null;
        }
        markIntroSeen();
        return cloneSlide(introPrologueSlide);
    };

    const showIntroIfNeeded = (): Promise<boolean> => {
        return Promise.resolve(consumeIntroPrologue() !== null);
    };

    const openIntro = (reason: IntroSequenceReason = 'story'): Promise<void> => {
        openIntroInternal(reason);
        return Promise.resolve();
    };

    let lastPaddleFlavorTimestamp = 0;
    let lastComboFlavorTimestamp = 0;

    const handlePaddleHit = (): void => {
        if (isMobile) {
            return;
        }
        const nowMs = clock();
        if (nowMs - lastPaddleFlavorTimestamp < PADDLE_FLAVOR_COOLDOWN_MS) {
            return;
        }
        lastPaddleFlavorTimestamp = nowMs;
        const paddleLines = i18n.t('flavor.paddle', { returnObjects: true }) as string[];
        const line = selectRandomEntry(random, paddleLines, DEFAULT_PADDLE_FLAVOR);
        showFlavorMessage('hype', line, { clock, random });
    };

    const handleComboMilestone = (event: EventEnvelope<'ComboMilestoneReached'>) => {
        if (isMobile) {
            return;
        }
        const nowMs = clock();
        if (nowMs - lastComboFlavorTimestamp < COMBO_FLAVOR_COOLDOWN_MS) {
            return;
        }
        lastComboFlavorTimestamp = nowMs;
        const comboTemplates = i18n.t('flavor.combo', { returnObjects: true }) as string[];
        const template = selectRandomEntry(random, comboTemplates, DEFAULT_COMBO_FLAVOR);
        const text = formatTemplate(template, {
            combo: event.payload.combo,
            multiplier: event.payload.multiplier.toFixed(2),
            points: Math.round(event.payload.pointsAwarded).toLocaleString(),
        });
        showFlavorMessage('info', text, { clock, random, durationMs: FLAVOR_DURATION_MS + 1200 });
    };

    const unsubscribes: (() => void)[] = [];
    if (typeof bus.subscribe === 'function') {
        unsubscribes.push(bus.subscribe('PaddleHit', handlePaddleHit));
        unsubscribes.push(bus.subscribe('ComboMilestoneReached', handleComboMilestone));
    } else {
        logger.warn('Event bus does not support subscriptions; reactive narrative cues disabled.');
    }

    const handleIdleResume = (summary: IdleSimulationResultSummary | null) => {
        if (!summary) {
            return;
        }
        const story = generateFateLedgerIdleNarrative(random, {
            durationMs: summary.durationMs,
            entropyEarned: summary.entropyAwarded,
            certaintyDustEarned: summary.certaintyDustAwarded,
            bricksBroken: summary.bricksSimulated,
        });

        const duration = toSecondsLabel(summary.durationMs);
        const line = `${story} (${duration} drift)`;
        showFlavorMessage('info', line, { clock, random, durationMs: FLAVOR_DURATION_MS + 1800 });
    };

    const dispose = () => {
        while (unsubscribes.length > 0) {
            try {
                const unsubscribe = unsubscribes.pop();
                unsubscribe?.();
            } catch (error) {
                logger.warn('Failed to unsubscribe narrative listener', { error });
            }
        }
    };

    return {
        showIntroIfNeeded,
        consumeIntroPrologue,
        openIntro,
        markIntroSeen,
        handleIdleResume,
        dispose,
    } satisfies NarrativeService;
};
