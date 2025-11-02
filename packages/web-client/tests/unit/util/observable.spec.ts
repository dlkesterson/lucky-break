import { describe, expect, it, vi } from 'vitest';
import { createSubject } from 'util/observable';
import type { Logger } from 'util/log';

describe('createSubject', () => {
    it('broadcasts values to subscribers until unsubscribe', () => {
        const subject = createSubject<number>();
        const first = vi.fn();
        const second = vi.fn();

        const sub1 = subject.subscribe(first);
        const sub2 = subject.subscribe(second);

        subject.next(1);
        sub1.unsubscribe();
        subject.next(2);

        expect(first).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledWith(1);
        expect(second).toHaveBeenCalledTimes(2);
        expect(second).toHaveBeenLastCalledWith(2);

        sub2.unsubscribe();
    });

    it('completes once and ignores late emissions and subscriptions', () => {
        const subject = createSubject<string>();
        const listener = vi.fn();
        const subscription = subject.subscribe(listener);

        subject.next('alpha');
        subject.complete();
        subject.next('beta');
        subject.complete();

        const late = vi.fn();
        const lateSubscription = subject.subscribe(late);

        subject.next('gamma');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('alpha');
        expect(late).not.toHaveBeenCalled();

        subscription.unsubscribe();
        lateSubscription.unsubscribe();
    });

    it('allows unsubscribe to be idempotent', () => {
        const subject = createSubject<number>();
        const spy = vi.fn();
        const subscription = subject.subscribe(spy);

        subscription.unsubscribe();
        subscription.unsubscribe();
        subject.next(99);

        expect(spy).not.toHaveBeenCalled();
    });

    it('logs lifecycle events when debug options are provided', () => {
        const createLoggerStub = () => {
            const debug = vi.fn();
            const info = vi.fn();
            const warn = vi.fn();
            const error = vi.fn();
            const child = vi.fn<[string], Logger>();

            const logger: Logger = {
                debug,
                info,
                warn,
                error,
                child: (suffix: string) => child(suffix),
            };

            child.mockReturnValue(logger);

            return {
                logger,
                debug,
                info,
                warn,
                error,
                child,
            };
        };

        const childLoggerStub = createLoggerStub();
        const baseLoggerStub = createLoggerStub();
        baseLoggerStub.child.mockReturnValue(childLoggerStub.logger);

        const subject = createSubject<number>({
            debug: {
                label: 'test-stream',
                logger: baseLoggerStub.logger,
                serialize: (value) => value,
                logOnNext: 'distinct',
            },
        });

        const subscription = subject.subscribe(() => {
            /* noop observer */
        });

        subject.next(1);
        subject.next(1);
        subject.next(2);
        subscription.unsubscribe();
        subject.complete();

        expect(baseLoggerStub.child).toHaveBeenCalledWith('observable:test-stream');

        const debugCalls = childLoggerStub.debug.mock.calls as [string, Record<string, unknown>?][];
        expect(debugCalls).toContainEqual(['subscribe', { observers: 1 }]);
        expect(debugCalls).toContainEqual(['unsubscribe', { observers: 0 }]);
        expect(debugCalls).toContainEqual(['complete', { observers: 0 }]);

        const nextCalls = debugCalls.filter(([event]) => event === 'next');
        expect(nextCalls).toHaveLength(2);
        expect(nextCalls[0][1]).toEqual({ observers: 1, value: 1 });
        expect(nextCalls[1][1]).toEqual({ observers: 1, value: 2 });
    });
});
