import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createConsoleMock = (overrides: Partial<Console> = {}): Console => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    ...overrides,
} as unknown as Console);

describe('logging utilities', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('routes log entries to matching console sink', async () => {
        const consoleMock = createConsoleMock();
        vi.stubGlobal('console', consoleMock);
        const { defaultLogWriter } = await import('util/log');

        defaultLogWriter({ level: 'warn', subsystem: 'test', message: 'something happened', timestamp: 0 });

        expect(consoleMock.warn).toHaveBeenCalledWith('1970-01-01T00:00:00.000Z [WARN][test] something happened');
    });

    it('falls back to console.log when specific sink missing', async () => {
        const fallback = vi.fn();
        const consoleMock = createConsoleMock({ warn: undefined as unknown as Console['warn'], log: fallback });
        vi.stubGlobal('console', consoleMock);
        const { defaultLogWriter } = await import('util/log');

        defaultLogWriter({ level: 'warn', subsystem: 'fallback', message: 'missing sink', timestamp: 0 });

        expect(fallback).toHaveBeenCalledWith('1970-01-01T00:00:00.000Z [WARN][fallback] missing sink');
    });

    it('serializes context objects alongside the message', async () => {
        const consoleMock = createConsoleMock();
        vi.stubGlobal('console', consoleMock);
        const { defaultLogWriter } = await import('util/log');

        defaultLogWriter({ level: 'info', subsystem: 'ctx', message: 'payload', timestamp: 0, context: { value: 42 } });

        expect(consoleMock.info).toHaveBeenCalledWith('1970-01-01T00:00:00.000Z [INFO][ctx] payload', { value: 42 });
    });

    it('creates loggers that normalise subsystem names and propagate options', async () => {
        const writer = vi.fn();
        const now = vi.fn(() => 123);
        const { createLogger } = await import('util/log');

        const logger = createLogger(' gameplay ', { writer, now });
        logger.debug('tick');
        logger.error('boom', { reason: 'badness' });

        expect(writer).toHaveBeenNthCalledWith(1, {
            level: 'debug',
            subsystem: 'gameplay',
            message: 'tick',
            context: undefined,
            timestamp: 123,
        });
        expect(writer).toHaveBeenNthCalledWith(2, {
            level: 'error',
            subsystem: 'gameplay',
            message: 'boom',
            context: { reason: 'badness' },
            timestamp: 123,
        });
    });

    it('creates child loggers with derived subsystem names', async () => {
        const writer = vi.fn();
        const now = vi.fn(() => 555);
        const { createLogger } = await import('util/log');

        const parent = createLogger(' gameplay ', { writer, now });
        const child = parent.child(' network ');
        child.info('ready');

        expect(writer).toHaveBeenCalledWith({
            level: 'info',
            subsystem: 'gameplay:network',
            message: 'ready',
            context: undefined,
            timestamp: 555,
        });
    });
});
