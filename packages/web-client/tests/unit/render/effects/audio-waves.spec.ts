import { beforeEach, describe, expect, it, vi } from 'vitest';

const pixiState = vi.hoisted(() => {
    class BaseDisplayObject {
        label: string | undefined;
        eventMode: string | undefined;
        sortableChildren = false;
        visible = true;
        zIndex = 0;
        destroy = vi.fn();
    }

    class MockContainer extends BaseDisplayObject {
        children: any[] = [];
        parent: MockContainer | null = null;

        addChild(...nodes: any[]): void {
            for (const node of nodes) {
                if (!node) {
                    continue;
                }
                node.parent = this;
                this.children.push(node);
            }
        }
    }

    class MockGraphics extends MockContainer {
        clear = vi.fn();
        rect = vi.fn();
        fill = vi.fn();
        moveTo = vi.fn();
        lineTo = vi.fn();
        stroke = vi.fn();
        circle = vi.fn();
    }

    return { MockContainer, MockGraphics };
});

vi.mock('pixi.js', () => ({
    Container: pixiState.MockContainer,
    Graphics: pixiState.MockGraphics,
}));

type MockGraphics = InstanceType<typeof pixiState.MockGraphics>;

type MockFn = ReturnType<typeof vi.fn>;

import { createAudioWaveBackdrop, type AudioWaveBumpOptions, type AudioWaveKind } from 'render/effects/audio-waves';
import { mixColors } from 'render/playfield-visuals';

const FORESHADOW_CANCEL = 0xff6b7a;
const FORESHADOW_SCHEDULE = 0x7dd8ff;
const FORESHADOW_MELODIC = 0x8bf9ff;
const FORESHADOW_PERCUSSION = 0xffd997;
const SFX_HIGHLIGHT = 0xffdb6e;
const MUSIC_HIGHLIGHT = 0xafa2ff;

const SFX_NOTE_BLEND = mixColors(SFX_HIGHLIGHT, 0xffffff, 0.25);
const MUSIC_NOTE_BLEND = mixColors(MUSIC_HIGHLIGHT, 0xffffff, 0.2);

const createFixture = () => {
    const backdrop = createAudioWaveBackdrop({ width: 240, height: 160 });
    backdrop.setVisible(true);
    vi.clearAllMocks();

    const container = backdrop.container as unknown as InstanceType<typeof pixiState.MockContainer>;
    const wavesGraphic = container.children[1] as MockGraphics;

    return { backdrop, wavesGraphic };
};

const extractStrokeCalls = (graphics: MockGraphics): MockFn['mock']['calls'] => {
    const strokeMock = graphics.stroke as unknown as MockFn;
    return strokeMock.mock.calls;
};

describe('createAudioWaveBackdrop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('bump highlight selection', () => {
        const highlightCases: {
            label: string;
            kind: AudioWaveKind | 'invalid';
            options?: AudioWaveBumpOptions;
            expectedColor: number;
        }[] = [
                {
                    label: 'foreshadow cancel accent',
                    kind: 'foreshadow',
                    options: { accent: 'cancel', intensity: 0.8 },
                    expectedColor: FORESHADOW_CANCEL,
                },
                {
                    label: 'foreshadow schedule accent',
                    kind: 'foreshadow',
                    options: { accent: 'schedule', intensity: 0.6 },
                    expectedColor: FORESHADOW_SCHEDULE,
                },
                {
                    label: 'foreshadow percussion instrument',
                    kind: 'foreshadow',
                    options: { accent: 'note', instrument: 'percussion', intensity: 0.5 },
                    expectedColor: FORESHADOW_PERCUSSION,
                },
                {
                    label: 'foreshadow melodic default',
                    kind: 'foreshadow',
                    options: { accent: 'note', instrument: 'melodic', intensity: 0.5 },
                    expectedColor: FORESHADOW_MELODIC,
                },
                {
                    label: 'sfx cancel accent',
                    kind: 'sfx',
                    options: { accent: 'cancel', intensity: 0.7 },
                    expectedColor: FORESHADOW_CANCEL,
                },
                {
                    label: 'sfx schedule accent',
                    kind: 'sfx',
                    options: { accent: 'schedule', intensity: 0.7 },
                    expectedColor: SFX_HIGHLIGHT,
                },
                {
                    label: 'sfx default accent',
                    kind: 'sfx',
                    options: { accent: 'note', intensity: 0.7 },
                    expectedColor: SFX_NOTE_BLEND,
                },
                {
                    label: 'music cancel accent',
                    kind: 'music',
                    options: { accent: 'cancel', intensity: 0.9 },
                    expectedColor: FORESHADOW_CANCEL,
                },
                {
                    label: 'music schedule accent',
                    kind: 'music',
                    options: { accent: 'schedule', intensity: 0.9 },
                    expectedColor: MUSIC_HIGHLIGHT,
                },
                {
                    label: 'music default accent',
                    kind: 'music',
                    options: { accent: 'note', intensity: 0.9 },
                    expectedColor: MUSIC_NOTE_BLEND,
                },
                {
                    label: 'fallback highlight for unexpected kind',
                    kind: 'invalid',
                    options: { intensity: 0.6 },
                    expectedColor: SFX_HIGHLIGHT,
                },
            ];

        it.each(highlightCases)('uses expected spark color for $label', ({ kind, options, expectedColor }) => {
            const { backdrop, wavesGraphic } = createFixture();
            const typedKind = kind === 'invalid' ? ('invalid' as unknown as AudioWaveKind) : kind;

            backdrop.bump(typedKind, options);
            backdrop.update(0.016);

            const strokeCalls = extractStrokeCalls(wavesGraphic);
            expect(strokeCalls.length).toBeGreaterThan(0);
            const lastStroke = strokeCalls.at(-1)?.[0];
            expect(lastStroke?.color).toBe(expectedColor);
        });
    });

    it('ignores bumps with non-finite intensity', () => {
        const { backdrop, wavesGraphic } = createFixture();

        backdrop.bump('music', { intensity: Number.NaN });
        backdrop.update(0.016);

        expect(extractStrokeCalls(wavesGraphic)).toHaveLength(0);
    });

    it('skips redraw when update receives a non-positive delta', () => {
        const { backdrop, wavesGraphic } = createFixture();

        backdrop.bump('sfx', { intensity: 0.8 });
        backdrop.update(0);

        expect(extractStrokeCalls(wavesGraphic)).toHaveLength(0);

        backdrop.update(0.016);
        expect(extractStrokeCalls(wavesGraphic)).not.toHaveLength(0);
    });
});
