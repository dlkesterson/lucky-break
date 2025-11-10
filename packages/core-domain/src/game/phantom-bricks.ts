import type { MatterBody as Body } from 'physics/matter';

export interface PhantomBrickOptions {
    readonly entropyReward: number;
}

export interface PhantomBrickManager {
    readonly register: (brick: Body) => void;
    readonly unregister: (brick: Body) => void;
    readonly clear: () => void;
    readonly isPhantom: (brick: Body) => boolean;
    readonly getEntropyReward: () => number;
    readonly forEach: (callback: (brick: Body) => void) => void;
    readonly count: () => number;
}

export const createPhantomBrickManager = (
    options: PhantomBrickOptions,
): PhantomBrickManager => {
    const { entropyReward } = options;
    const phantoms = new Set<Body>();

    const register: PhantomBrickManager['register'] = (brick) => {
        phantoms.add(brick);
    };

    const unregister: PhantomBrickManager['unregister'] = (brick) => {
        phantoms.delete(brick);
    };

    const clear: PhantomBrickManager['clear'] = () => {
        phantoms.clear();
    };

    const isPhantom: PhantomBrickManager['isPhantom'] = (brick) => {
        return phantoms.has(brick);
    };

    const getEntropyReward: PhantomBrickManager['getEntropyReward'] = () => {
        return entropyReward;
    };

    const forEach: PhantomBrickManager['forEach'] = (callback) => {
        phantoms.forEach(callback);
    };

    const count: PhantomBrickManager['count'] = () => {
        return phantoms.size;
    };

    return {
        register,
        unregister,
        clear,
        isPhantom,
        getEntropyReward,
        forEach,
        count,
    };
};
