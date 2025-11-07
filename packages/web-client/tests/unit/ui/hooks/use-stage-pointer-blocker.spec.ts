import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Fragment, type ReactElement } from 'react';
import { useStagePointerBlocker } from 'ui/hooks/useStagePointerBlocker';

const BlockerProbe = ({ active, getDocument }: { active: boolean; getDocument?: () => Document | null }) => {
    useStagePointerBlocker(active, getDocument);
    return null;
};

describe('useStagePointerBlocker', () => {
    let container: HTMLDivElement;
    let root: Root;
    let stage: HTMLDivElement;
    const getDocument = () => document;

    const renderProbe = async (element: ReactElement) => {
        await act(async () => {
            root.render(element);
        });
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        stage = document.createElement('div');
        stage.id = 'stage-wrap';
        document.body.appendChild(stage);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        stage.remove();
        container.remove();
    });

    it('adds and removes the stage blocker class when active', async () => {
        await renderProbe(createElement(BlockerProbe, { active: true, getDocument }));
        expect(stage.classList.contains('ui-stage-blocked')).toBe(true);

        act(() => {
            root.unmount();
        });
        expect(stage.classList.contains('ui-stage-blocked')).toBe(false);
    });

    it('reference counts multiple consumers', async () => {
        const MultiProbe = ({
            firstActive,
            secondActive,
        }: {
            firstActive: boolean;
            secondActive: boolean;
        }) =>
            createElement(
                Fragment,
                {},
                createElement(BlockerProbe, { active: firstActive, getDocument }),
                createElement(BlockerProbe, { active: secondActive, getDocument }),
            );

        await renderProbe(createElement(MultiProbe, { firstActive: true, secondActive: true }));
        expect(stage.classList.contains('ui-stage-blocked')).toBe(true);

        await renderProbe(createElement(MultiProbe, { firstActive: false, secondActive: true }));
        expect(stage.classList.contains('ui-stage-blocked')).toBe(true);

        await renderProbe(createElement(MultiProbe, { firstActive: false, secondActive: false }));
        expect(stage.classList.contains('ui-stage-blocked')).toBe(false);
    });

    it('falls back to the global document when no getter is provided', async () => {
        await renderProbe(createElement(BlockerProbe, { active: true }));
        expect(stage.classList.contains('ui-stage-blocked')).toBe(true);
    });

    it('does nothing when the stage element cannot be found', async () => {
        stage.remove();
        await renderProbe(createElement(BlockerProbe, { active: true, getDocument }));
        expect(document.querySelector('.ui-stage-blocked')).toBeNull();
    });
});
