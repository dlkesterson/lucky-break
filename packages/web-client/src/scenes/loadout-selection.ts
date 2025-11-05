import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { buildLoadoutFormPresets, normalizeLoadoutSelection } from 'app/runtime/loadouts';
import type { LoadoutFormPreset } from 'app/runtime/loadouts';
import type { LoadoutSelection, LoadoutFormId } from 'config/loadouts';
import { loadoutSelectionUiBridge } from 'ui/state/loadout-selection-bridge';

export interface LoadoutSelectionPayload {
    readonly formPresets?: readonly LoadoutFormPreset[];
    readonly lockedForms?: readonly LoadoutFormId[];
    readonly initialSelection?: Partial<LoadoutSelection>;
    readonly onCommit: (selection: LoadoutSelection) => MaybePromise<void>;
}

type MaybePromise<T> = T | Promise<T>;

export const createLoadoutSelectionScene = (
    context: SceneContext<GameSceneServices>,
): Scene<LoadoutSelectionPayload, GameSceneServices> => {
    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'loadout-selection',
            action,
        });
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('LoadoutSelectionScene requires payload');
            }

            const presets = payload.formPresets?.length ? payload.formPresets : buildLoadoutFormPresets();
            if (presets.length === 0) {
                throw new Error('No loadout presets are available');
            }

            const lockedFormsList = payload.lockedForms ? [...payload.lockedForms] : [];
            const lockedSet = new Set<LoadoutFormId>(lockedFormsList);
            const normalized = normalizeLoadoutSelection(payload.initialSelection);
            let defaultPreset = presets.find((preset) => preset.id === normalized.form && !lockedSet.has(preset.id)) ?? null;
            defaultPreset ??= presets.find((preset) => !lockedSet.has(preset.id)) ?? presets[0] ?? null;

            const commitSelection = async (selection: LoadoutSelection): Promise<void> => {
                await payload.onCommit(selection);
                context.popScene();
            };

            loadoutSelectionUiBridge.enter({
                presets,
                lockedForms: lockedFormsList,
                defaultFormId: defaultPreset?.id ?? null,
                commitSelection,
            });

            emitSceneEvent('enter');
            context.renderStageSoon();
        },
        update() {
            /* no-op */
        },
        destroy() {
            emitSceneEvent('exit');
            loadoutSelectionUiBridge.exit();
            context.renderStageSoon();
        },
        suspend() {
            emitSceneEvent('suspend');
            loadoutSelectionUiBridge.suspend();
        },
        resume() {
            emitSceneEvent('resume');
            loadoutSelectionUiBridge.resume();
            context.renderStageSoon();
        },
    } satisfies Scene<LoadoutSelectionPayload, GameSceneServices>;
};
