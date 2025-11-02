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
});
