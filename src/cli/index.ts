export interface CliCommand {
    readonly execute: () => Promise<number>;
}

export function createCli(): CliCommand {
    throw new Error('createCli not implemented');
}
