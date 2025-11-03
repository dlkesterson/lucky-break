import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { createEffectRegistry } from 'render/effects';

describe('createEffectRegistry', () => {
    it('destroys tracked handles when disposed', () => {
        const registry = createEffectRegistry();
        const destroy = vi.fn();
        const handle = { destroy };

        registry.track(handle);
        expect(registry.size).toBe(1);

        registry.disposeAll();

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(registry.size).toBe(0);
    });

    it('prefers custom disposers over intrinsic destroy methods', () => {
        const registry = createEffectRegistry();
        const destroy = vi.fn();
        const custom = vi.fn();
        const handle = { destroy };

        registry.track(handle, custom);
        registry.disposeAll();

        expect(custom).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('uses dispose fallback when destroy is unavailable', () => {
        const registry = createEffectRegistry();
        const dispose = vi.fn();
        const handle = { dispose };

        registry.track(handle);
        registry.disposeAll();

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('ignores handles without any disposal hooks', () => {
        const registry = createEffectRegistry();
        const handle = {};

        registry.track(handle);

        expect(registry.size).toBe(0);
        expect(() => registry.disposeAll()).not.toThrow();
    });

    it('removes and destroys tracked containers by default', () => {
        const registry = createEffectRegistry();
        const parent = new Container();
        const child = new Container();
        parent.addChild(child);
        const destroySpy = vi.spyOn(child, 'destroy');

        registry.trackContainer(child, { destroy: { children: true } });
        registry.disposeAll();

        expect(child.parent).toBeNull();
        expect(destroySpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).toHaveBeenCalledWith({ children: true });
    });

    it('can skip removal when configured', () => {
        const registry = createEffectRegistry();
        const parent = new Container();
        const child = new Container();
        parent.addChild(child);

        registry.trackContainer(child, { remove: false });
        registry.disposeAll();

        expect(child.parent).toBe(parent);
    });

    it('falls back to parent removal when removeFromParent is unavailable', () => {
        const registry = createEffectRegistry();
        const removeChild = vi.fn();
        const destroy = vi.fn();
        const container = {
            parent: { removeChild },
            destroy,
        } as unknown as Container;

        registry.trackContainer(container);
        registry.disposeAll();

        expect(removeChild).toHaveBeenCalledWith(container);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('registers additional disposers and swallows cleanup errors', () => {
        const registry = createEffectRegistry();
        const ok = vi.fn();
        const faulty = vi.fn(() => {
            throw new Error('cleanup failed');
        });

        registry.addDisposer(ok);
        registry.addDisposer(faulty);
        registry.addDisposer(undefined as unknown as () => void);

        expect(registry.size).toBe(2);
        expect(() => registry.disposeAll()).not.toThrow();
        expect(ok).toHaveBeenCalledTimes(1);
        expect(faulty).toHaveBeenCalledTimes(1);
        expect(registry.size).toBe(0);
    });
});
