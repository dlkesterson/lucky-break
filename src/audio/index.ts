export interface AudioBootstrapOptions {
    readonly enableMusic?: boolean;
    readonly enableSfx?: boolean;
}

export interface AudioSubsystem {
    readonly shutdown: () => void;
}

export function bootstrapAudio(_options: AudioBootstrapOptions = {}): AudioSubsystem {
    throw new Error('bootstrapAudio not implemented');
}
