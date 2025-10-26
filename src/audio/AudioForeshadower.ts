import { Gain, MembraneSynth, Part, PolySynth, Transport } from 'tone';
import { mulberry32, type RandomSource } from 'util/random';

export type ForeshadowEventType = 'brickHit' | 'paddleBounce';

export interface PredictedEvent {
    readonly id: string;
    readonly type: ForeshadowEventType;
    readonly timeUntil: number;
    readonly targetMidi?: number;
    readonly intensity?: number;
    readonly leadInSeconds?: number;
}

interface ForeshadowPatternEvent {
    readonly offset: number;
    readonly instrument: 'melodic' | 'percussion';
    readonly midi?: number;
    readonly velocity: number;
    readonly duration: number;
}

interface ForeshadowPattern {
    readonly duration: number;
    readonly events: readonly ForeshadowPatternEvent[];
    readonly instrument: 'melodic' | 'percussion';
}

interface ScheduledForeshadow {
    readonly event: PredictedEvent;
    readonly pattern: ForeshadowPattern;
    readonly part: Part<ForeshadowPatternEvent>;
    readonly gain: Gain;
    readonly instrument: PolySynth | MembraneSynth;
    cleanupId: number | null;
    disposeId: number | null;
    readonly endTime: number;
}

const clamp01 = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

const clampMidi = (note: number, min = 36, max = 96): number => {
    if (!Number.isFinite(note)) {
        return min;
    }
    return Math.max(min, Math.min(max, Math.round(note)));
};

const midiToFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

const DEFAULT_SCALE: readonly number[] = [64, 67, 69, 71, 72, 74, 76];

const MIN_EVENT_TIME = 0.2;
const MIN_LEAD_SECONDS = 0.35;
const MAX_LEAD_SECONDS = 2.6;
const CLEANUP_DELAY = 0.35;

export interface ForeshadowScheduleTelemetry {
    readonly event: PredictedEvent;
    readonly instrument: ForeshadowPattern['instrument'];
    readonly duration: number;
    readonly startTime: number;
    readonly endTime: number;
    readonly noteCount: number;
    readonly averageVelocity: number;
}

export interface ForeshadowTriggerTelemetry {
    readonly eventId: string;
    readonly instrument: ForeshadowPattern['instrument'];
    readonly velocity: number;
    readonly time: number;
}

export interface ForeshadowCompletionTelemetry {
    readonly eventId: string;
    readonly reason: 'completed' | 'cancelled';
}

export interface ForeshadowDiagnostics {
    readonly onPatternScheduled?: (payload: ForeshadowScheduleTelemetry) => void;
    readonly onNoteTriggered?: (payload: ForeshadowTriggerTelemetry) => void;
    readonly onEventFinalized?: (payload: ForeshadowCompletionTelemetry) => void;
}

type ForeshadowEffectId = 'drum-roll' | 'scale-run';

export class AudioForeshadower {
    private readonly masterGain: Gain;

    private readonly scale: readonly number[];

    private readonly seed: number;

    private readonly active = new Map<string, ScheduledForeshadow>();

    private readonly diagnostics?: ForeshadowDiagnostics;

    private disposed = false;

    constructor(scale: readonly number[], seed: number, diagnostics?: ForeshadowDiagnostics) {
        const resolvedScale = scale.length > 0 ? scale : DEFAULT_SCALE;
        this.scale = Array.from(resolvedScale, (value) => clampMidi(value));
        this.seed = seed >>> 0;
        this.masterGain = new Gain(1);
        this.masterGain.toDestination();
        this.diagnostics = diagnostics;
    }

    scheduleEvent(event: PredictedEvent): void {
        if (this.disposed) {
            return;
        }

        if (!event || typeof event.id !== 'string' || event.id.length === 0) {
            return;
        }

        if (!Number.isFinite(event.timeUntil) || event.timeUntil <= MIN_EVENT_TIME) {
            return;
        }

        this.cancelEvent(event.id);

        const rng = mulberry32(this.computeSeed(event));
        const leadIn = this.resolveLeadIn(event, rng);
        const pattern = this.buildPattern(event, leadIn, rng);

        if (pattern.events.length === 0) {
            return;
        }

        const currentTransport = Transport.now();
        const startOffset = Math.max(0, event.timeUntil - pattern.duration);
        const startTime = currentTransport + startOffset;
        const endTime = currentTransport + Math.max(event.timeUntil, pattern.duration + startOffset);

        const gain = new Gain(0);
        gain.connect(this.masterGain);

        const instrument = this.createInstrument(pattern.instrument, gain);

        const part = new Part<ForeshadowPatternEvent>((time, payload: ForeshadowPatternEvent) => {
            if (this.disposed) {
                return;
            }
            const velocity = clamp01(payload.velocity);
            const duration = Math.max(0.05, payload.duration);
            if (pattern.instrument === 'percussion' && instrument instanceof MembraneSynth) {
                const note = clampMidi(payload.midi ?? 36);
                const freq = midiToFrequency(note);
                try {
                    instrument.triggerAttackRelease(freq, duration, time, velocity);
                } catch {
                    // Tone.js may throw if context is suspended; ignore.
                }
                this.diagnostics?.onNoteTriggered?.({
                    eventId: event.id,
                    instrument: pattern.instrument,
                    velocity,
                    time,
                });
                return;
            }

            if (pattern.instrument === 'melodic' && instrument instanceof PolySynth) {
                const note = clampMidi(payload.midi ?? this.pickScaleNote(rng));
                const freq = midiToFrequency(note);
                try {
                    instrument.triggerAttackRelease(freq, duration, time, velocity);
                } catch {
                    // Ignore playback failure; transport may be paused.
                }
                this.diagnostics?.onNoteTriggered?.({
                    eventId: event.id,
                    instrument: pattern.instrument,
                    velocity,
                    time,
                });
            }
        });

        pattern.events.forEach((entry) => {
            part.add(entry.offset, entry);
        });

        part.loop = false;
        part.humanize = false;
        part.start(startTime);
        part.stop(endTime);

        const fadeInStart = Math.max(currentTransport, startTime - 0.05);
        gain.gain.setValueAtTime(0, fadeInStart);
        gain.gain.linearRampToValueAtTime(1, startTime + 0.12);

        const scheduled: ScheduledForeshadow = {
            event,
            pattern,
            part,
            gain,
            instrument,
            cleanupId: null,
            disposeId: null,
            endTime,
        };

        const cleanupTime = endTime + CLEANUP_DELAY;
        scheduled.cleanupId = Transport.scheduleOnce((time) => {
            if (this.disposed) {
                return;
            }
            if (!this.active.has(event.id)) {
                return;
            }
            try {
                scheduled.gain.gain.cancelAndHoldAtTime(time);
                scheduled.gain.gain.linearRampToValueAtTime(0, time + 0.18);
            } catch {
                // Ignore ramp errors.
            }
            try {
                scheduled.part.stop(time);
                scheduled.part.cancel(0);
            } catch {
                // Ignore Tone errors for stopping an already finished part.
            }

            scheduled.disposeId = Transport.scheduleOnce(() => {
                this.disposeScheduled(event.id, 'completed');
            }, time + 0.22);
        }, cleanupTime);

        this.active.set(event.id, scheduled);

        const averageVelocity = pattern.events.length > 0
            ? pattern.events.reduce((sum, entry) => sum + clamp01(entry.velocity), 0) / pattern.events.length
            : 0;
        this.diagnostics?.onPatternScheduled?.({
            event,
            instrument: pattern.instrument,
            duration: pattern.duration,
            startTime,
            endTime,
            noteCount: pattern.events.length,
            averageVelocity,
        });
    }

    cancelEvent(eventId: string): void {
        if (!eventId || this.disposed) {
            return;
        }
        const scheduled = this.active.get(eventId);
        if (!scheduled) {
            return;
        }

        if (scheduled.cleanupId !== null) {
            try {
                Transport.clear(scheduled.cleanupId);
            } catch {
                // ignore
            }
            scheduled.cleanupId = null;
        }

        if (scheduled.disposeId !== null) {
            try {
                Transport.clear(scheduled.disposeId);
            } catch {
                // ignore
            }
            scheduled.disposeId = null;
        }

        const now = Transport.now();
        try {
            scheduled.part.stop(now);
            scheduled.part.cancel(0);
        } catch {
            // already stopped
        }

        try {
            scheduled.gain.gain.cancelAndHoldAtTime(now);
            scheduled.gain.gain.linearRampToValueAtTime(0, now + 0.18);
        } catch {
            // ignore ramp issues
        }

        scheduled.disposeId = Transport.scheduleOnce(() => {
            this.disposeScheduled(eventId, 'cancelled');
        }, now + 0.24);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const id of this.active.keys()) {
            this.cancelEvent(id);
        }
        this.active.clear();
        try {
            this.masterGain.dispose();
        } catch {
            // ignore disposal failures
        }
    }

    private disposeScheduled(eventId: string, reason: 'completed' | 'cancelled' = 'completed'): void {
        const scheduled = this.active.get(eventId);
        if (!scheduled) {
            return;
        }
        this.active.delete(eventId);
        try {
            scheduled.part.dispose();
        } catch {
            // ignore
        }
        try {
            scheduled.instrument.dispose();
        } catch {
            // ignore
        }
        try {
            scheduled.gain.dispose();
        } catch {
            // ignore
        }
        this.diagnostics?.onEventFinalized?.({ eventId, reason });
    }

    private computeSeed(event: PredictedEvent): number {
        let hash = this.seed ^ 0x9e3779b1;
        const source = `${event.id}:${event.type}`;
        for (let index = 0; index < source.length; index += 1) {
            hash = (hash ^ source.charCodeAt(index)) * 0x45d9f3b;
            hash ^= hash >>> 16;
        }
        return hash >>> 0;
    }

    private resolveLeadIn(event: PredictedEvent, rng: RandomSource): number {
        const preferred = Number.isFinite(event.leadInSeconds) && (event.leadInSeconds ?? 0) > 0
            ? Math.min(Math.max(event.leadInSeconds ?? MIN_LEAD_SECONDS, MIN_LEAD_SECONDS), MAX_LEAD_SECONDS)
            : event.timeUntil * (0.65 + rng() * 0.2);
        const maxLead = Math.min(MAX_LEAD_SECONDS, Math.max(MIN_LEAD_SECONDS, event.timeUntil - 0.1));
        return Math.min(Math.max(MIN_LEAD_SECONDS, preferred), maxLead);
    }

    private buildPattern(event: PredictedEvent, leadInSeconds: number, rng: RandomSource): ForeshadowPattern {
        const effect = this.chooseEffect(event, rng);
        if (effect === 'drum-roll') {
            return this.buildDrumRoll(event, leadInSeconds, rng);
        }
        return this.buildScaleRun(event, leadInSeconds, rng);
    }

    private chooseEffect(event: PredictedEvent, rng: RandomSource): ForeshadowEffectId {
        const intensity = clamp01(event.intensity ?? 0.45);
        const bias = intensity > 0.6 ? 0.7 : intensity < 0.3 ? 0.35 : 0.5;
        return rng() < bias ? 'drum-roll' : 'scale-run';
    }

    private buildDrumRoll(event: PredictedEvent, leadInSeconds: number, rng: RandomSource): ForeshadowPattern {
        const duration = Math.min(Math.max(leadInSeconds, 0.45), Math.max(0.6, event.timeUntil - 0.1));
        const steps = Math.max(4, Math.round(duration * 7));
        const velocityBase = 0.32 + clamp01(event.intensity ?? 0.4) * 0.4;
        const events: ForeshadowPatternEvent[] = [];
        const stepDuration = duration / steps;
        for (let index = 0; index < steps; index += 1) {
            const progress = (index + 1) / steps;
            const velocity = Math.min(1, velocityBase + progress * 0.55 + rng() * 0.08);
            events.push({
                offset: index * stepDuration,
                instrument: 'percussion',
                midi: 36 + Math.floor(progress * 2),
                velocity,
                duration: Math.min(0.16, stepDuration * 0.65),
            });
        }
        events.push({
            offset: duration,
            instrument: 'percussion',
            midi: 38,
            velocity: Math.min(1, velocityBase + 0.6),
            duration: 0.22,
        });
        return {
            duration,
            events,
            instrument: 'percussion',
        };
    }

    private buildScaleRun(event: PredictedEvent, leadInSeconds: number, rng: RandomSource): ForeshadowPattern {
        const target = clampMidi(event.targetMidi ?? this.pickScaleNote(rng));
        const duration = Math.min(Math.max(leadInSeconds, 0.5), Math.max(0.65, event.timeUntil - 0.08));
        const steps = Math.max(3, Math.min(8, Math.round(duration * 4.5)));
        const events: ForeshadowPatternEvent[] = [];
        const stepDuration = duration / steps;
        let currentIndex = this.scale.findIndex((note) => note >= target - 12);
        if (currentIndex < 0) {
            currentIndex = Math.floor(rng() * this.scale.length);
        }
        for (let index = 0; index < steps; index += 1) {
            const progress = (index + 1) / (steps + 1);
            const scaleNote = this.scale[(currentIndex + index) % this.scale.length];
            const note = clampMidi(scaleNote + Math.floor(progress * 12));
            const velocity = Math.min(1, 0.35 + progress * 0.5 + (event.intensity ?? 0.3) * 0.4);
            events.push({
                offset: index * stepDuration,
                instrument: 'melodic',
                midi: note,
                velocity,
                duration: Math.min(0.24, stepDuration * 0.85),
            });
        }
        events.push({
            offset: duration,
            instrument: 'melodic',
            midi: target,
            velocity: Math.min(1, 0.55 + clamp01(event.intensity ?? 0.4) * 0.5),
            duration: 0.32,
        });

        return {
            duration,
            events,
            instrument: 'melodic',
        };
    }

    private createInstrument(kind: ForeshadowPattern['instrument'], gain: Gain): PolySynth | MembraneSynth {
        if (kind === 'percussion') {
            const drum = new MembraneSynth({
                pitchDecay: 0.018,
                octaves: 1.3,
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.18 },
            });
            drum.connect(gain);
            return drum;
        }

        const synth = new PolySynth({ maxPolyphony: 6 });
        synth.connect(gain);
        try {
            synth.set({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.24, sustain: 0.22, release: 0.4 },
                detune: -25,
            });
        } catch {
            // Ignore configuration errors; Tone will fallback to defaults.
        }
        return synth;
    }

    private pickScaleNote(rng: RandomSource): number {
        if (this.scale.length === 0) {
            return 60;
        }
        const index = Math.floor(rng() * this.scale.length) % this.scale.length;
        return this.scale[index];
    }
}
