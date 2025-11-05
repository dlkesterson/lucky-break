import { useEffect } from 'react';

let stagePointerBlockCount = 0;

const resolveGlobalDocument = (): Document | null => {
    if (typeof document === 'undefined') {
        return null;
    }
    return document;
};

export const useStagePointerBlocker = (
    active: boolean,
    getDocument?: () => Document | null,
): void => {
    useEffect(() => {
        if (!active) {
            return;
        }

        const candidate = getDocument?.() ?? resolveGlobalDocument();
        if (!candidate) {
            return;
        }

        const stage = candidate.getElementById('stage-wrap');
        if (!stage) {
            return;
        }

        stagePointerBlockCount += 1;
        stage.classList.add('ui-stage-blocked');

        return () => {
            stagePointerBlockCount = Math.max(0, stagePointerBlockCount - 1);
            if (stagePointerBlockCount === 0) {
                stage.classList.remove('ui-stage-blocked');
            }
        };
    }, [active, getDocument]);
};
