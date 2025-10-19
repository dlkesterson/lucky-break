import { describe, expect, it, vi } from 'vitest';
import { createSubject } from 'util/observable';

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
});
