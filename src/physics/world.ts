export interface PhysicsWorldConfig {
    readonly gravity?: number;
}

export interface PhysicsWorldHandle {
    readonly dispose: () => void;
}

export function createPhysicsWorld(_config: PhysicsWorldConfig = {}): PhysicsWorldHandle {
    throw new Error('createPhysicsWorld not implemented');
}
