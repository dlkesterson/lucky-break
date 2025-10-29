import { GameInputManager } from 'input/input-manager';
import type { LaunchIntent, Vector2 } from 'input/contracts';
import type { StageHandle } from 'render/stage';
import { smoothTowards } from 'util/input-helpers';

export interface RuntimeInputOptions {
    readonly container: HTMLElement;
    readonly stage: StageHandle;
    readonly playfieldWidth: number;
    readonly smoothing: {
        readonly responsiveness: number;
        readonly snapThreshold: number;
    };
}

export interface PaddleMovementContext {
    readonly deltaSeconds: number;
    readonly currentX: number;
    readonly paddleWidth: number;
    readonly target: Vector2 | null;
}

export interface ResolvedInputTarget {
    readonly screen: Vector2 | null;
    readonly playfield: Vector2 | null;
}

export interface RuntimeInput {
    readonly manager: GameInputManager;
    install(): void;
    dispose(): void;
    syncPaddlePosition(position: Vector2 | null): void;
    resetLaunchTrigger(): void;
    shouldLaunch(): boolean;
    consumeLaunchIntent(): LaunchIntent | null;
    resolveTarget(): ResolvedInputTarget;
    computeNextX(context: PaddleMovementContext): number;
    consumeKeyPress(code: string): boolean;
}

const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

export const createRuntimeInput = ({
    container,
    stage,
    playfieldWidth,
    smoothing,
}: RuntimeInputOptions): RuntimeInput => {
    const manager = new GameInputManager();

    const install = () => {
        manager.initialize(container);
    };

    const dispose = () => {
        const maybeDestroy = (manager as { destroy?: () => void }).destroy;
        if (typeof maybeDestroy === 'function') {
            maybeDestroy.call(manager);
        }
    };

    const resolveTarget = (): ResolvedInputTarget => {
        const target = manager.getPaddleTarget();
        if (!target) {
            return { screen: null, playfield: null } satisfies ResolvedInputTarget;
        }
        const playfieldTarget = stage.toPlayfield(target);
        return {
            screen: target,
            playfield: playfieldTarget,
        } satisfies ResolvedInputTarget;
    };

    const computeNextX = ({ deltaSeconds, currentX, paddleWidth, target }: PaddleMovementContext): number => {
        if (!target) {
            return clamp(currentX, paddleWidth / 2, playfieldWidth - paddleWidth / 2);
        }

        const halfWidth = paddleWidth / 2;
        const desiredX = clamp(target.x, halfWidth, playfieldWidth - halfWidth);
        if (deltaSeconds <= 0) {
            return desiredX;
        }

        const nextX = smoothTowards(currentX, desiredX, deltaSeconds, smoothing);
        return clamp(nextX, halfWidth, playfieldWidth - halfWidth);
    };

    return {
        manager,
        install,
        dispose,
        syncPaddlePosition: (position) => {
            manager.syncPaddlePosition(position);
        },
        resetLaunchTrigger: () => {
            manager.resetLaunchTrigger();
        },
        shouldLaunch: () => manager.shouldLaunch(),
        consumeLaunchIntent: () => manager.consumeLaunchIntent(),
        resolveTarget,
        computeNextX,
        consumeKeyPress: (code) => manager.consumeKeyPress(code),
    } satisfies RuntimeInput;
};
