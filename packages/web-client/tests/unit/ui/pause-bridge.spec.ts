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
            legendLines: ['Line one', 'Line two'],
            resumeLabel: 'Resume',
            quitLabel: 'Quit',
            onResume,
            onQuit,
        });

        const state = usePauseUi.getState();
        expect(state.visible).toBe(true);
        expect(state.suspended).toBe(false);
        expect(state.snapshot?.legendLines).toHaveLength(2);

        await state.snapshot?.onResume();
        expect(onResume).toHaveBeenCalled();

        await state.snapshot?.onQuit?.();
        expect(onQuit).toHaveBeenCalled();

        pauseUiBridge.exit();
        expect(usePauseUi.getState()).toEqual({ visible: false, suspended: false, snapshot: null });
    });

    it('suspends and resumes only when visible', () => {
        pauseUiBridge.suspend();
        expect(usePauseUi.getState().suspended).toBe(false);

        pauseUiBridge.enter({
            title: 'Paused',
            score: 0,
            legendTitle: null,
            legendLines: [],
            resumeLabel: 'Resume',
            quitLabel: null,
            onResume: async () => { },
            onQuit: null,
        });

        pauseUiBridge.suspend();
        expect(usePauseUi.getState().suspended).toBe(true);

        pauseUiBridge.resume();
        expect(usePauseUi.getState().suspended).toBe(false);
    });
});
