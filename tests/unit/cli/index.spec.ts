import { describe, expect, it } from 'vitest';
import { createCli } from 'cli/index';

describe('cli barrel', () => {
    it('provides a createCli command factory', () => {
        const cli = createCli();
        expect(cli).toBeDefined();
        expect(typeof cli.execute).toBe('function');
    });
});
