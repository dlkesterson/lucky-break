import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const unmountMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock, unmount: unmountMock }));

vi.mock('react-dom/client', () => ({
    createRoot: createRootMock,
}));

describe('initializeReactUi', () => {
    beforeEach(() => {
        renderMock.mockClear();
        unmountMock.mockClear();
        createRootMock.mockClear();
        document.body.innerHTML = '';
        void vi.resetModules();
    });

    it('mounts the HUD when the container exists', async () => {
        document.body.innerHTML = '<div id="ui-root"></div>';
        const { initializeReactUi } = await import('ui/boot/react-root');

        initializeReactUi();

        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect(renderMock).toHaveBeenCalledTimes(1);
    });

    it('does not remount when already mounted', async () => {
        document.body.innerHTML = '<div id="ui-root"></div>';
        const { initializeReactUi } = await import('ui/boot/react-root');

        initializeReactUi();
        initializeReactUi();

        expect(createRootMock).toHaveBeenCalledTimes(1);
    });
});
