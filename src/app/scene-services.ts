import type { LuckyBreakEventBus } from './events';
import type { ToneScheduler, ReactiveAudioGameState } from 'audio/scheduler';
import type { Subject } from 'util/observable';
import type { MusicDirector } from 'audio/music-director';
import type { RandomManager } from 'util/random';
import type { ReplayBuffer } from './replay-buffer';

export interface GameSceneServices {
    readonly bus: LuckyBreakEventBus;
    readonly scheduler: ToneScheduler;
    readonly audioState$: Subject<ReactiveAudioGameState>;
    readonly musicDirector: MusicDirector;
    readonly random: RandomManager;
    readonly replayBuffer: ReplayBuffer;
    readonly renderStageSoon: () => void;
}
