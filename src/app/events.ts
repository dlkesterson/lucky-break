export type BrickType = 'standard' | 'multi-hit' | 'indestructible' | 'power-up' | 'gamble';
export type WallHitSide = 'top' | 'left' | 'right' | 'bottom';
export type LifeLostCause = 'ball-drop' | 'timeout' | 'forced-reset';
export interface VectorLike {
    readonly x: number;
    readonly y: number;
}

export interface BrickBreakPayload {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly impactVelocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
    readonly initialHp: number;
}

export interface PaddleHitPayload {
    readonly sessionId: string;
    readonly angle: number;
    readonly speed: number;
    readonly impactOffset: number;
}

export interface WallHitPayload {
    readonly sessionId: string;
    readonly side: WallHitSide;
    readonly speed: number;
}

export interface BrickHitPayload {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly impactVelocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
    readonly previousHp: number;
    readonly remainingHp: number;
}

export interface LifeLostPayload {
    readonly sessionId: string;
    readonly livesRemaining: number;
    readonly cause: LifeLostCause;
}

export interface BallLaunchedPayload {
    readonly sessionId: string;
    readonly position: VectorLike;
    readonly direction: VectorLike;
    readonly speed: number;
}

export interface RoundCompletedPayload {
    readonly sessionId: string;
    readonly round: number;
    readonly scoreAwarded: number;
    readonly durationMs: number;
}

export interface ComboMilestonePayload {
    readonly sessionId: string;
    readonly combo: number;
    readonly multiplier: number;
    readonly pointsAwarded: number;
    readonly totalScore: number;
}

export type UiSceneName = 'main-menu' | 'gameplay' | 'pause' | 'level-complete' | 'game-over';
export type UiSceneTransitionAction = 'enter' | 'exit' | 'suspend' | 'resume';

export interface UiSceneTransitionPayload {
    readonly scene: UiSceneName;
    readonly action: UiSceneTransitionAction;
}

export interface LuckyBreakEventMap {
    readonly BrickBreak: BrickBreakPayload;
    readonly BrickHit: BrickHitPayload;
    readonly PaddleHit: PaddleHitPayload;
    readonly WallHit: WallHitPayload;
    readonly LifeLost: LifeLostPayload;
    readonly BallLaunched: BallLaunchedPayload;
    readonly RoundCompleted: RoundCompletedPayload;
    readonly ComboMilestoneReached: ComboMilestonePayload;
    readonly UiSceneTransition: UiSceneTransitionPayload;
}

export type LuckyBreakEventName = keyof LuckyBreakEventMap;

export interface EventEnvelope<EventName extends LuckyBreakEventName> {
    readonly type: EventName;
    readonly timestamp: number;
    readonly payload: LuckyBreakEventMap[EventName];
}

export type EventListener<EventName extends LuckyBreakEventName> = (
    event: EventEnvelope<EventName>,
) => void;

export interface LuckyBreakEventBus {
    publish<EventName extends LuckyBreakEventName>(
        this: void,
        type: EventName,
        payload: LuckyBreakEventMap[EventName],
        timestamp?: number,
    ): void;
    subscribe<EventName extends LuckyBreakEventName>(
        this: void,
        type: EventName,
        listener: EventListener<EventName>,
    ): () => void;
    subscribeOnce<EventName extends LuckyBreakEventName>(
        this: void,
        type: EventName,
        listener: EventListener<EventName>,
    ): () => void;
    unsubscribe<EventName extends LuckyBreakEventName>(
        this: void,
        type: EventName,
        listener: EventListener<EventName>,
    ): void;
    clear(this: void): void;
    listeners<EventName extends LuckyBreakEventName>(
        this: void,
        type: EventName,
    ): readonly EventListener<EventName>[];
}

export interface BrickBreakEventInput {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly impactVelocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
    readonly initialHp: number;
    readonly timestamp?: number;
}

export interface RoundCompletedEventInput {
    readonly sessionId: string;
    readonly round: number;
    readonly scoreAwarded: number;
    readonly durationMs: number;
    readonly timestamp?: number;
}

export interface ScoringEventEmitter {
    readonly brickBreak: (this: void, event: BrickBreakEventInput) => void;
    readonly roundCompleted: (this: void, event: RoundCompletedEventInput) => void;
    readonly lifeLost: (this: void, event: LifeLostPayload & { readonly timestamp?: number }) => void;
}

type InternalListener = EventListener<LuckyBreakEventName>;

type ListenerRegistry = Map<LuckyBreakEventName, Set<InternalListener>>;

const ensureListenerSet = (registry: ListenerRegistry, type: LuckyBreakEventName): Set<InternalListener> => {
    const existing = registry.get(type);
    if (existing) {
        return existing;
    }

    const created = new Set<InternalListener>();
    registry.set(type, created);
    return created;
};

const toEnvelope = <EventName extends LuckyBreakEventName>(
    type: EventName,
    payload: LuckyBreakEventMap[EventName],
    timestamp: number,
): EventEnvelope<EventName> => ({
    type,
    payload,
    timestamp,
});

interface E2EHarness {
    readonly onEvent?: (event: EventEnvelope<LuckyBreakEventName>) => void;
    readonly startGameplay?: () => Promise<void> | void;
}

const readE2EHarness = (): E2EHarness | null => {
    const candidate = globalThis as { __LB_E2E_HOOKS__?: unknown };
    const harness = candidate.__LB_E2E_HOOKS__;
    if (!harness || typeof harness !== 'object') {
        return null;
    }
    return harness as E2EHarness;
};

const notifyE2EHarness = (event: EventEnvelope<LuckyBreakEventName>): void => {
    const harness = readE2EHarness();
    if (!harness?.onEvent) {
        return;
    }

    try {
        harness.onEvent(event);
    } catch {
        /* ignore errors from test harness observers */
    }
};

export interface EventBusOptions {
    readonly now?: () => number;
}

export const createEventBus = (options: EventBusOptions = {}): LuckyBreakEventBus => {
    const registry: ListenerRegistry = new Map();
    const resolveNow = options.now ?? Date.now;

    const publish: LuckyBreakEventBus['publish'] = (type, payload, timestamp = resolveNow()) => {
        const envelope = toEnvelope(type, payload, timestamp);
        notifyE2EHarness(envelope as EventEnvelope<LuckyBreakEventName>);

        const listeners = registry.get(type);
        if (!listeners || listeners.size === 0) {
            return;
        }

        for (const listener of listeners) {
            listener(envelope);
        }
    };

    const unsubscribe: LuckyBreakEventBus['unsubscribe'] = (type, listener) => {
        const listeners = registry.get(type);
        if (!listeners) {
            return;
        }

        listeners.delete(listener as InternalListener);
        if (listeners.size === 0) {
            registry.delete(type);
        }
    };

    const subscribe: LuckyBreakEventBus['subscribe'] = (type, listener) => {
        const listeners = ensureListenerSet(registry, type);
        listeners.add(listener as InternalListener);
        return () => unsubscribe(type, listener);
    };

    const subscribeOnceInternal = <EventName extends LuckyBreakEventName>(
        type: EventName,
        listener: EventListener<EventName>,
    ): (() => void) => {
        const unsubscribe = subscribe(type, (event) => {
            unsubscribe();
            listener(event);
        });
        return unsubscribe;
    };

    const subscribeOnce = subscribeOnceInternal as LuckyBreakEventBus['subscribeOnce'];

    const clear: LuckyBreakEventBus['clear'] = () => {
        registry.clear();
    };

    const listeners: LuckyBreakEventBus['listeners'] = (type) => {
        const listenersForType = registry.get(type);
        if (!listenersForType) {
            return [];
        }

        return Array.from(listenersForType) as EventListener<typeof type>[];
    };

    return {
        publish,
        subscribe,
        subscribeOnce,
        unsubscribe,
        clear,
        listeners,
    };
};

export const createScoringEventEmitter = (bus: LuckyBreakEventBus): ScoringEventEmitter => {
    const publishBrickBreak: ScoringEventEmitter['brickBreak'] = (event) => {
        bus.publish(
            'BrickBreak',
            {
                sessionId: event.sessionId,
                row: event.row,
                col: event.col,
                impactVelocity: event.impactVelocity,
                brickType: event.brickType,
                comboHeat: event.comboHeat,
                initialHp: event.initialHp,
            },
            event.timestamp,
        );
    };

    const publishRoundCompleted: ScoringEventEmitter['roundCompleted'] = (event) => {
        bus.publish(
            'RoundCompleted',
            {
                sessionId: event.sessionId,
                round: event.round,
                scoreAwarded: event.scoreAwarded,
                durationMs: event.durationMs,
            },
            event.timestamp,
        );
    };

    const publishLifeLost: ScoringEventEmitter['lifeLost'] = (event) => {
        bus.publish(
            'LifeLost',
            {
                sessionId: event.sessionId,
                livesRemaining: event.livesRemaining,
                cause: event.cause,
            },
            event.timestamp,
        );
    };

    return {
        brickBreak: publishBrickBreak,
        roundCompleted: publishRoundCompleted,
        lifeLost: publishLifeLost,
    };
};
