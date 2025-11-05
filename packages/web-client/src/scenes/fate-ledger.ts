import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { fateLedgerUiBridge } from 'ui/state/fate-ledger-bridge';

export const createFateLedgerScene = (
    context: SceneContext<GameSceneServices>,
): Scene<undefined, GameSceneServices> => {
    let destroyed = false;
    let unsubscribeLedger: (() => void) | null = null;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'fate-ledger',
            action,
        });
    };

    const pushIdleAudioState = () => {
        context.audioState$.next({
            combo: 0,
            activePowerUps: [],
            lookAheadMs: context.scheduler.lookAheadMs,
        });
    };

    return {
        init() {
            destroyed = false;

            const close = () => {
                if (destroyed) {
                    return;
                }
                context.popScene();
            };

            fateLedgerUiBridge.enter({
                snapshot: context.fateLedger.getSnapshot(),
                onClose: close,
            });

            unsubscribeLedger = context.fateLedger.subscribe((snapshot) => {
                fateLedgerUiBridge.update(snapshot);
                context.renderStageSoon();
            });

            pushIdleAudioState();
            emitSceneEvent('enter');
            context.renderStageSoon();
        },
        update(deltaSeconds) {
            void deltaSeconds;
        },
        destroy() {
            destroyed = true;
            unsubscribeLedger?.();
            unsubscribeLedger = null;
            fateLedgerUiBridge.exit();
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            pushIdleAudioState();
            emitSceneEvent('suspend');
            fateLedgerUiBridge.suspend();
        },
        resume() {
            pushIdleAudioState();
            emitSceneEvent('resume');
            fateLedgerUiBridge.resume();
            context.renderStageSoon();
        },
    };
};
