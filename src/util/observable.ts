import { rootLogger, type Logger } from 'util/log';

export interface Subscription {
    unsubscribe(this: void): void;
}

export interface Observable<T> {
    subscribe(this: void, observer: (value: T) => void): Subscription;
}

export interface Subject<T> extends Observable<T> {
    next(this: void, value: T): void;
    complete(this: void): void;
}

export interface SubjectDebugOptions<T> {
    readonly label: string;
    readonly logger?: Logger;
    readonly serialize?: (value: T) => unknown;
    readonly logOnNext?: 'always' | 'distinct';
}

export interface SubjectOptions<T> {
    readonly debug?: SubjectDebugOptions<T>;
}

const defaultSerialize = (value: unknown): unknown => {
    if (value === null || value === undefined) {
        return value;
    }

    const type = typeof value;
    if (type === 'object') {
        if (Array.isArray(value)) {
            return { type: 'array', length: value.length };
        }

        const keys = Object.keys(value as Record<string, unknown>);
        return { type: 'object', keys: keys.slice(0, 5) };
    }

    if (type === 'function') {
        return { type: 'function' };
    }

    return value;
};

const sanitizeLabel = (label: string): string => label.trim() || 'anonymous';

export const createSubject = <T>(options: SubjectOptions<T> = {}): Subject<T> => {
    const observers = new Set<(value: T) => void>();
    let isComplete = false;

    const debugOptions = options.debug;
    const baseLogger = debugOptions?.logger ?? rootLogger;
    const subjectLogger = debugOptions
        ? baseLogger.child(`observable:${sanitizeLabel(debugOptions.label)}`)
        : null;
    const logOnNext = debugOptions?.logOnNext ?? 'always';
    let lastSerialized: unknown = Symbol('initial');

    const log = (message: string, context?: Record<string, unknown>) => {
        subjectLogger?.debug(message, context);
    };

    const serializeValue = (value: T): unknown => {
        if (!subjectLogger) {
            return undefined;
        }

        if (!debugOptions?.serialize) {
            return defaultSerialize(value);
        }

        try {
            return debugOptions.serialize(value);
        } catch (error) {
            log('serialize-error', {
                message: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    };

    const shouldLogNext = (serialized: unknown): boolean => {
        if (!subjectLogger) {
            return false;
        }

        if (logOnNext === 'distinct') {
            if (Object.is(serialized, lastSerialized)) {
                return false;
            }
            lastSerialized = serialized;
        }

        return true;
    };

    const subscribe = (observer: (value: T) => void): Subscription => {
        if (isComplete) {
            log('subscribe-after-complete');
            return {
                unsubscribe: () => {
                    /* no-op */
                },
            };
        }

        observers.add(observer);
        log('subscribe', { observers: observers.size });

        return {
            unsubscribe: () => {
                const removed = observers.delete(observer);
                if (removed) {
                    log('unsubscribe', { observers: observers.size });
                }
            },
        };
    };

    const next = (value: T): void => {
        if (isComplete) {
            log('next-after-complete');
            return;
        }

        const serialized = serializeValue(value);
        if (shouldLogNext(serialized)) {
            const context: Record<string, unknown> = {
                observers: observers.size,
            };

            if (serialized !== undefined) {
                context.value = serialized;
            }

            log('next', context);
        }

        for (const observer of [...observers]) {
            observer(value);
        }
    };

    const complete = (): void => {
        if (isComplete) {
            log('complete-after-complete');
            return;
        }

        isComplete = true;
        log('complete', { observers: observers.size });
        observers.clear();
    };

    return {
        subscribe,
        next,
        complete,
    };
};
