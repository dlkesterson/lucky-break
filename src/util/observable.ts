export interface Subscription {
    unsubscribe(): void;
}

export interface Observable<T> {
    subscribe(observer: (value: T) => void): Subscription;
}

export interface Subject<T> extends Observable<T> {
    next(value: T): void;
    complete(): void;
}

export const createSubject = <T>(): Subject<T> => {
    const observers = new Set<(value: T) => void>();
    let isComplete = false;

    const subscribe = (observer: (value: T) => void): Subscription => {
        if (isComplete) {
            return {
                unsubscribe: () => {
                    /* no-op */
                },
            };
        }

        observers.add(observer);
        return {
            unsubscribe: () => {
                observers.delete(observer);
            },
        };
    };

    const next = (value: T): void => {
        if (isComplete) {
            return;
        }

        for (const observer of [...observers]) {
            observer(value);
        }
    };

    const complete = (): void => {
        if (isComplete) {
            return;
        }

        isComplete = true;
        observers.clear();
    };

    return {
        subscribe,
        next,
        complete,
    };
};
