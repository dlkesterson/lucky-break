export type BrickType = 'standard' | 'multi-hit' | 'indestructible' | 'power-up';
export type WallHitSide = 'top' | 'left' | 'right' | 'bottom';
export type LifeLostCause = 'ball-drop' | 'timeout' | 'forced-reset';

export interface BrickBreakPayload {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly velocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
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
    readonly velocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
    readonly remainingHp: number;
}

export interface LifeLostPayload {
    readonly sessionId: string;
    readonly livesRemaining: number;
    readonly cause: LifeLostCause;
}

export interface RoundCompletedPayload {
    readonly sessionId: string;
    readonly round: number;
    readonly scoreAwarded: number;
    readonly durationMs: number;
}

export type LuckyBreakEventMap = {
    readonly BrickBreak: BrickBreakPayload;
    readonly BrickHit: BrickHitPayload;
    readonly PaddleHit: PaddleHitPayload;
    readonly WallHit: WallHitPayload;
    readonly LifeLost: LifeLostPayload;
    readonly RoundCompleted: RoundCompletedPayload;
};

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
        type: EventName,
        payload: LuckyBreakEventMap[EventName],
        timestamp?: number,
    ): void;
    subscribe<EventName extends LuckyBreakEventName>(
        type: EventName,
        listener: EventListener<EventName>,
    ): () => void;
    subscribeOnce<EventName extends LuckyBreakEventName>(
        type: EventName,
        listener: EventListener<EventName>,
    ): () => void;
    unsubscribe<EventName extends LuckyBreakEventName>(
        type: EventName,
        listener: EventListener<EventName>,
    ): void;
    clear(): void;
    listeners<EventName extends LuckyBreakEventName>(type: EventName): readonly EventListener<EventName>[];
}

export interface BrickBreakEventInput {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly velocity: number;
    readonly brickType: BrickType;
    readonly comboHeat: number;
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
    readonly brickBreak: (event: BrickBreakEventInput) => void;
    readonly roundCompleted: (event: RoundCompletedEventInput) => void;
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

export const createEventBus = (): LuckyBreakEventBus => {
    const registry: ListenerRegistry = new Map();

    const publish: LuckyBreakEventBus['publish'] = (type, payload, timestamp = Date.now()) => {
        const listeners = registry.get(type);
        if (!listeners || listeners.size === 0) {
            return;
        }

        const envelope = toEnvelope(type, payload, timestamp);
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
        let unsubscribeRef: (() => void) | undefined;
        const wrapped: EventListener<EventName> = (event) => {
            unsubscribeRef?.();
            listener(event);
        };
        unsubscribeRef = subscribe(type, wrapped);
        return unsubscribeRef;
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
                velocity: event.velocity,
                brickType: event.brickType,
                comboHeat: event.comboHeat,
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

    return {
        brickBreak: publishBrickBreak,
        roundCompleted: publishRoundCompleted,
    };
};
