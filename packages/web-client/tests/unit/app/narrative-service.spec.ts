import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createNarrativeService, type NarrativeService } from 'app/narrative-service';
import type { LuckyBreakEventBus, EventEnvelope } from 'app/events';
import type { RandomManager } from 'util/random';
import type { Logger } from 'util/log';
import { hudSetters } from 'ui/state/game-bridge';
import { introOverlayBridge } from 'ui/state/intro-bridge';
import type { IdleSimulationResultSummary } from 'app/runtime/idle';

vi.mock('ui/state/game-bridge', () => ({
    hudSetters: {
        showFlavor: vi.fn(),
    },
}));

vi.mock('ui/state/intro-bridge', () => ({
    introOverlayBridge: {
        isActive: vi.fn(),
        open: vi.fn(),
    },
}));

vi.mock('app/fate-ledger', () => ({
    generateFateLedgerIdleNarrative: vi.fn(() => 'Idle narrative story'),
}));

vi.mock('i18n', () => ({
    i18n: {
        t: vi.fn((key: string) => {
            if (key === 'flavor.paddle') {
                return ['Nice hit!', 'Great save!', 'Smooth!'];
            }
            if (key === 'flavor.combo') {
                return ['{{combo}}x combo!', 'Combo {{multiplier}}!'];
            }
            return [];
        }),
    },
}));

describe('narrative-service', () => {
    let service: NarrativeService;
    let mockBus: LuckyBreakEventBus;
    let mockRandom: RandomManager;
    let mockLogger: Logger;
    let mockNow: () => number;
    let currentTime: number;

    beforeEach(() => {
        currentTime = 1000000;
        mockNow = vi.fn(() => currentTime);

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(() => mockLogger),
        };

        mockRandom = {
            seed: vi.fn(() => 12345),
            setSeed: vi.fn(() => 12345),
            reset: vi.fn(),
            next: vi.fn(() => 0.5),
            random: (() => 0.5) as () => number,
            nextInt: vi.fn(() => 0),
            boolean: vi.fn(() => true),
        };

        const subscriptions = new Map<string, ((event: unknown) => void)[]>();
        mockBus = {
            publish: vi.fn(),
            subscribe: vi.fn((eventType: string, handler: (event: unknown) => void) => {
                if (!subscriptions.has(eventType)) {
                    subscriptions.set(eventType, []);
                }
                subscriptions.get(eventType)!.push(handler);
                return () => {
                    const handlers = subscriptions.get(eventType);
                    if (handlers) {
                        const index = handlers.indexOf(handler);
                        if (index >= 0) {
                            handlers.splice(index, 1);
                        }
                    }
                };
            }),
            subscribeOnce: vi.fn(),
            unsubscribe: vi.fn(),
            clear: vi.fn(),
            listeners: vi.fn(() => []),
        };

        (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent = (eventType: string, event: unknown) => {
            const handlers = subscriptions.get(eventType) ?? [];
            handlers.forEach(handler => handler(event));
        };

        vi.clearAllMocks();
    });

    afterEach(() => {
        service?.dispose();
    });

    describe('openIntro', () => {
        it('opens intro overlay with default reason when not already active', async () => {
            const mockIsActive = vi.fn(() => false);
            const mockOpen = vi.fn();
            introOverlayBridge.isActive = mockIsActive;
            introOverlayBridge.open = mockOpen;

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            await service.openIntro();

            expect(mockOpen).toHaveBeenCalledWith({
                slides: [],
                reason: 'story',
                completionLabel: 'Begin the Wager',
                advanceLabel: 'Continue',
            });
        });

        it('opens intro overlay with custom reason', async () => {
            const mockIsActive = vi.fn(() => false);
            const mockOpen = vi.fn();
            introOverlayBridge.isActive = mockIsActive;
            introOverlayBridge.open = mockOpen;

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            await service.openIntro('tutorial');

            expect(mockOpen).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason: 'tutorial',
                })
            );
        });

        it('skips opening when overlay is already active', async () => {
            const mockIsActive = vi.fn(() => true);
            const mockOpen = vi.fn();
            introOverlayBridge.isActive = mockIsActive;
            introOverlayBridge.open = mockOpen;

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            await service.openIntro();

            expect(mockOpen).not.toHaveBeenCalled();
        });
    });

    describe('paddle hit flavor messages', () => {
        it('shows paddle flavor message on PaddleHit event', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});

            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.any(String),
                    tone: 'hype',
                }),
                expect.objectContaining({
                    durationMs: expect.any(Number),
                })
            );
        });

        it('respects cooldown period for paddle flavor messages', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});
            expect(hudSetters.showFlavor).toHaveBeenCalledTimes(1);

            vi.clearAllMocks();
            currentTime += 1000; // Less than 2400ms cooldown
            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});
            expect(hudSetters.showFlavor).not.toHaveBeenCalled();

            vi.clearAllMocks();
            currentTime += 2000; // Now exceeds cooldown
            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});
            expect(hudSetters.showFlavor).toHaveBeenCalledTimes(1);
        });

        it('skips paddle flavor on mobile devices', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
                isMobile: true,
            });

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});

            expect(hudSetters.showFlavor).not.toHaveBeenCalled();
        });
    });

    describe('combo milestone flavor messages', () => {
        it('shows combo flavor message on ComboMilestoneReached event', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            const event: EventEnvelope<'ComboMilestoneReached'> = {
                type: 'ComboMilestoneReached',
                timestamp: 1000,
                payload: {
                    sessionId: 'test-session',
                    combo: 10,
                    multiplier: 2.5,
                    pointsAwarded: 1500,
                    totalScore: 5000,
                },
            };

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('ComboMilestoneReached', event);

            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    tone: 'info',
                    text: expect.stringContaining('10'),
                }),
                expect.any(Object)
            );
        });

        it('respects cooldown period for combo flavor messages', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            const event: EventEnvelope<'ComboMilestoneReached'> = {
                type: 'ComboMilestoneReached',
                timestamp: 1000,
                payload: { sessionId: 'test-session', combo: 10, multiplier: 2.0, pointsAwarded: 1000, totalScore: 2000 },
            };

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('ComboMilestoneReached', event);
            expect(hudSetters.showFlavor).toHaveBeenCalledTimes(1);

            vi.clearAllMocks();
            currentTime += 2000; // Less than 4400ms cooldown
            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('ComboMilestoneReached', event);
            expect(hudSetters.showFlavor).not.toHaveBeenCalled();

            vi.clearAllMocks();
            currentTime += 3000; // Now exceeds cooldown
            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('ComboMilestoneReached', event);
            expect(hudSetters.showFlavor).toHaveBeenCalledTimes(1);
        });

        it('skips combo flavor on mobile devices', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
                isMobile: true,
            });

            const event: EventEnvelope<'ComboMilestoneReached'> = {
                type: 'ComboMilestoneReached',
                timestamp: 1000,
                payload: { sessionId: 'test-session', combo: 10, multiplier: 2.0, pointsAwarded: 1000, totalScore: 2000 },
            };

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('ComboMilestoneReached', event);

            expect(hudSetters.showFlavor).not.toHaveBeenCalled();
        });
    });

    describe('handleIdleResume', () => {
        it('shows idle narrative when summary is provided', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            const summary: IdleSimulationResultSummary = {
                durationMs: 5000,
                entropyAwarded: 100,
                certaintyDustAwarded: 50,
                bricksSimulated: 25,
                round: 1,
            };

            service.handleIdleResume(summary);

            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    tone: 'info',
                    text: expect.stringContaining('Idle narrative story'),
                }),
                expect.any(Object)
            );
        });

        it('skips narrative when summary is null', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            service.handleIdleResume(null);

            expect(hudSetters.showFlavor).not.toHaveBeenCalled();
        });

        it('formats duration labels correctly for various time ranges', () => {
            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            // Test seconds
            service.handleIdleResume({
                durationMs: 5000,
                entropyAwarded: 10,
                certaintyDustAwarded: 5,
                bricksSimulated: 2,
                round: 1,
            });
            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining('5.0s'),
                }),
                expect.any(Object)
            );

            vi.clearAllMocks();

            // Test larger seconds
            service.handleIdleResume({
                durationMs: 45000,
                entropyAwarded: 10,
                certaintyDustAwarded: 5,
                bricksSimulated: 2,
                round: 2,
            });
            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining('45s'),
                }),
                expect.any(Object)
            );

            vi.clearAllMocks();

            // Test minutes
            service.handleIdleResume({
                durationMs: 120000,
                entropyAwarded: 10,
                certaintyDustAwarded: 5,
                bricksSimulated: 2,
                round: 3,
            });
            expect(hudSetters.showFlavor).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining('2m'),
                }),
                expect.any(Object)
            );
        });
    });

    describe('dispose', () => {
        it('unsubscribes all event handlers', () => {
            const unsubscribeSpy1 = vi.fn();
            const unsubscribeSpy2 = vi.fn();
            const subscribeMock = vi.mocked(mockBus.subscribe);
            subscribeMock.mockReturnValueOnce(unsubscribeSpy1).mockReturnValueOnce(unsubscribeSpy2);

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            service.dispose();

            expect(unsubscribeSpy1).toHaveBeenCalled();
            expect(unsubscribeSpy2).toHaveBeenCalled();
        });

        it('handles unsubscribe errors gracefully', () => {
            const failingUnsubscribe = vi.fn(() => {
                throw new Error('Unsubscribe failed');
            });
            const subscribeMock = vi.mocked(mockBus.subscribe);
            subscribeMock.mockReturnValue(failingUnsubscribe);

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            expect(() => service.dispose()).not.toThrow();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to unsubscribe narrative listener',
                expect.objectContaining({ error: expect.any(Error) })
            );
        });
    });

    describe('bus without subscribe support', () => {
        it('warns when event bus does not support subscriptions', () => {
            const incompleteBus = { emit: vi.fn() } as unknown as LuckyBreakEventBus;

            service = createNarrativeService({
                bus: incompleteBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Event bus does not support subscriptions; reactive narrative cues disabled.'
            );
        });
    });

    describe('random selection and formatting', () => {
        it('selects random flavor text using provided random manager', () => {
            vi.mocked(mockRandom.next).mockReturnValueOnce(0.1);

            service = createNarrativeService({
                bus: mockBus,
                random: mockRandom,
                logger: mockLogger,
                now: mockNow,
            });

            (mockBus as unknown as { _triggerEvent: (eventType: string, event: unknown) => void })._triggerEvent('PaddleHit', {});

            expect(mockRandom.next).toHaveBeenCalled();
            expect(hudSetters.showFlavor).toHaveBeenCalled();
        });
    });
});
