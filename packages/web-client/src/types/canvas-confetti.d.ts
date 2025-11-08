/* eslint-disable import/no-default-export -- canvas-confetti ships a default export we need to model */
declare module 'canvas-confetti' {
    export interface ConfettiOptions {
        readonly angle?: number;
        readonly colors?: readonly string[];
        readonly decay?: number;
        readonly disableForReducedMotion?: boolean;
        readonly drift?: number;
        readonly flat?: boolean;
        readonly gravity?: number;
        readonly origin?: { readonly x?: number; readonly y?: number };
        readonly particleCount?: number;
        readonly scalar?: number;
        readonly shapes?: readonly string[];
        readonly spread?: number;
        readonly startVelocity?: number;
        readonly ticks?: number;
        readonly zIndex?: number;
    }

    export interface ConfettiGlobalOptions {
        readonly disableForReducedMotion?: boolean;
        readonly resize?: boolean;
        readonly useWorker?: boolean;
    }

    export interface CreateTypes {
        (options?: ConfettiOptions): Promise<null> | null;
        reset(): void;
    }

    interface ConfettiFunction {
        (options?: ConfettiOptions): Promise<undefined> | null;
        create(canvas?: HTMLCanvasElement, options?: ConfettiGlobalOptions): CreateTypes;
        reset(): void;
    }

    const confetti: ConfettiFunction;
    export default confetti;
}
