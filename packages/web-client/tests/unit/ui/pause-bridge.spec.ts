import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseUiBridge, usePauseUi } from 'ui/state/pause-bridge';

const resetPauseState = () => {
    usePauseUi.setState({ visible: false, suspended: false, snapshot: null }, true);
};

describe('pauseUiBridge', () => {
    beforeEach(() => {
        resetPauseState();
    });

    it('enters with payload and resets on exit', async () => {
        const onResume = vi.fn().mockResolvedValue(undefined);
        const onQuit = vi.fn().mockResolvedValue(undefined);

        pauseUiBridge.enter({
            title: 'Paused',
            score: 12_345,
            legendTitle: 'Legend',
            legendItems: [
                { text: 'Line one' },
                { text: 'Line two' },
            ],
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume,
            onQuit,
        });

        const state = usePauseUi.getState();
        expect(state.visible).toBe(true);
        expect(state.suspended).toBe(false);
        expect(state.snapshot?.legendItems).toHaveLength(2);

        await state.snapshot?.onResume();
        expect(onResume).toHaveBeenCalled();

        await state.snapshot?.onQuit?.();
        expect(onQuit).toHaveBeenCalled();

        pauseUiBridge.exit();
        expect(usePauseUi.getState()).toEqual({ visible: false, suspended: false, snapshot: null });
    });

    it('suspends and resumes only when visible', () => {
        const onResume = vi.fn().mockResolvedValue(undefined);

        pauseUiBridge.suspend();
        expect(usePauseUi.getState().suspended).toBe(false);

        pauseUiBridge.enter({
            title: 'Placeholder',
            score: 0,
            legendTitle: null,
            legendItems: [],
            resumeLabel: 'OK',
            quitLabel: null,
            onResume,
            onQuit: null,
        });

        pauseUiBridge.suspend();
        expect(usePauseUi.getState().suspended).toBe(true);

        pauseUiBridge.resume();
        expect(usePauseUi.getState().suspended).toBe(false);
    });
});
