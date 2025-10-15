export interface StageConfig {
    readonly view?: HTMLCanvasElement;
}

export interface StageHandle {
    readonly destroy: () => void;
}

export function createStage(_config: StageConfig = {}): StageHandle {
    throw new Error('createStage not implemented');
}
