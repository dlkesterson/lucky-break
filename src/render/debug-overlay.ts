import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameInputManager } from 'input/input-manager';
import type { InputType, Vector2 } from 'input/contracts';
import type { PaddleBodyController } from './paddle-body';
import type { Paddle } from './contracts';
import type { StageHandle } from './stage';
import type { BallAttachmentController } from 'physics/ball-attachment';
import type { Ball } from 'physics/contracts';

export interface DebugOverlayOptions {
    readonly inputManager: GameInputManager;
    readonly paddleController: PaddleBodyController;
    readonly ballController: BallAttachmentController;
    readonly paddle: Paddle;
    readonly ball: Ball;
    readonly stage?: StageHandle;
}

const PANEL_MARGIN = 16;
const PANEL_PADDING_X = 12;
const PANEL_PADDING_Y = 10;
const PANEL_MIN_WIDTH = 240;
const PANEL_CORNER_RADIUS = 8;

const INPUT_COLORS: Record<InputType, number> = {
    mouse: 0x4fd0ff,
    touch: 0xffa94d,
    keyboard: 0xffffff,
    gamepad: 0xb389ff,
};

const DEFAULT_POINTER_COLOR = 0x4fd0ff;

const createTextStyle = () =>
    new TextStyle({
        fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: 14,
        fill: 0xffffff,
        align: 'left',
        leading: 4,
    });

const cloneVector = (value: Vector2 | null): Vector2 | null => {
    if (!value) {
        return null;
    }
    return { x: value.x, y: value.y } satisfies Vector2;
};

export class InputDebugOverlay {
    private readonly container: Container;
    private readonly panel: Container;
    private readonly background: Graphics;
    private readonly text: Text;
    private readonly pointer: Graphics;
    private readonly options: DebugOverlayOptions;

    constructor(options: DebugOverlayOptions) {
        this.options = options;

        this.container = new Container();
        this.container.label = 'input-debug-overlay';
        this.container.eventMode = 'none';
        this.container.visible = false;
        this.container.zIndex = 1_000;

        this.panel = new Container();
        this.panel.eventMode = 'none';
        this.panel.position.set(PANEL_MARGIN, PANEL_MARGIN);

        this.background = new Graphics();
        this.background.eventMode = 'none';

        this.text = new Text('', createTextStyle());
        this.text.eventMode = 'none';
        this.text.position.set(PANEL_PADDING_X, PANEL_PADDING_Y);

        this.pointer = new Graphics();
        this.pointer.eventMode = 'none';
        this.pointer.zIndex = 1_100;

        this.panel.addChild(this.background, this.text);
        this.container.addChild(this.panel, this.pointer);

        this.update();
    }

    getContainer(): Container {
        return this.container;
    }

    isVisible(): boolean {
        return this.container.visible;
    }

    setVisible(visible: boolean): void {
        this.container.visible = visible;
    }

    toggle(): boolean {
        this.setVisible(!this.container.visible);
        return this.container.visible;
    }

    update(): void {
        const inputState = this.options.inputManager.getDebugState();
        const paddleDebug = this.options.paddleController.getDebugInfo(this.options.paddle);
        const ballDebug = this.options.ballController.getDebugInfo(this.options.ball);

        const activeInputs = inputState.activeInputs.length > 0
            ? inputState.activeInputs.join(', ')
            : '—';
        const keyboardPressed = inputState.keyboardPressed.length > 0
            ? inputState.keyboardPressed.join(', ')
            : '—';
        const gamepadButtons = (inputState.gamepadButtonsPressed?.length ?? 0) > 0
            ? inputState.gamepadButtonsPressed.join(', ')
            : '—';
        const axisRaw = this.formatNumber(inputState.gamepadAxisRaw);
        const axisFiltered = this.formatNumber(inputState.gamepadAxisNormalized);
        const aimVector = this.formatVector(inputState.aimDirection);
        const launchState = inputState.launchPending ? 'pending' : 'ready';
        const launchExtras = inputState.gamepadLaunchHeld ? ' | trigger held' : '';

        const lines: string[] = [
            `Mode: ${inputState.primaryInput ?? 'none'}`,
            `Active: ${activeInputs}`,
            `Mouse: ${this.formatVector(inputState.mousePosition)}`,
            `Touch: ${this.formatVector(inputState.touchPosition)}`,
            `Gamepad: ${this.formatVector(inputState.gamepadCursor)}`,
            `Axis: raw ${axisRaw} | filtered ${axisFiltered}`,
            `Buttons: ${gamepadButtons}`,
            `Keyboard: ${keyboardPressed}`,
            `Aim: ${aimVector}`,
            `Target: ${this.formatVector(inputState.paddleTarget)}`,
            `Launch: ${launchState}${launchExtras}`,
            `Paddle: ${this.formatVector(paddleDebug.position)} | w ${paddleDebug.bounds.width.toFixed(1)}`,
            `Ball: ${ballDebug.isAttached ? 'attached' : 'free'} | pos ${this.formatVector(ballDebug.position)} | vel ${this.formatVector(ballDebug.velocity)}`,
        ];

        this.text.text = lines.join('\n');

        const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.ceil(this.text.width + PANEL_PADDING_X * 2));
        const panelHeight = Math.ceil(this.text.height + PANEL_PADDING_Y * 2);

        this.background.clear();
        this.background.roundRect(0, 0, panelWidth, panelHeight, PANEL_CORNER_RADIUS);
        this.background.fill({ color: 0x000000, alpha: 0.6 });
        this.background.stroke({ color: 0xffffff, width: 1, alpha: 0.18 });

        this.updatePointer(cloneVector(inputState.paddleTarget), inputState.primaryInput);
    }

    destroy(): void {
        this.pointer.destroy();
        this.text.destroy();
        this.background.destroy();
        this.panel.destroy();
        this.container.destroy();
    }

    private formatVector(value: Vector2 | null): string {
        if (!value) {
            return '—';
        }
        return `${value.x.toFixed(1)}, ${value.y.toFixed(1)}`;
    }

    private formatNumber(value: number | null | undefined): string {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '—';
        }
        return value.toFixed(2);
    }

    private resolvePointerColor(primary: InputType | null): number {
        if (!primary) {
            return DEFAULT_POINTER_COLOR;
        }
        return INPUT_COLORS[primary] ?? DEFAULT_POINTER_COLOR;
    }

    private updatePointer(target: Vector2 | null, primary: InputType | null): void {
        this.pointer.clear();
        if (!target) {
            return;
        }

        const point = this.options.stage ? this.options.stage.toPlayfield(target) : target;
        const color = this.resolvePointerColor(primary);

        this.pointer.circle(point.x, point.y, 9);
        this.pointer.moveTo(point.x - 12, point.y);
        this.pointer.lineTo(point.x + 12, point.y);
        this.pointer.moveTo(point.x, point.y - 12);
        this.pointer.lineTo(point.x, point.y + 12);
        this.pointer.stroke({ color, width: 1.5, alpha: 0.85 });
    }
}

export type RegulationDirection = 'boost' | 'clamp';

export interface PhysicsDebugOverlayState {
    readonly currentSpeed: number;
    readonly baseSpeed: number;
    readonly maxSpeed: number;
    readonly timeScale: number;
    readonly slowTimeScale: number;
    readonly slowTimeRemaining: number;
    readonly regulation?: {
        readonly delta: number;
        readonly direction: RegulationDirection;
    } | null;
    readonly extraBalls: number;
    readonly extraBallCapacity: number;
    readonly syncDriftMs?: number;
    readonly syncDriftAverageMs?: number;
    readonly syncDriftPeakMs?: number;
}

export class PhysicsDebugOverlay {
    private readonly container: Container;
    private readonly panel: Container;
    private readonly background: Graphics;
    private readonly text: Text;

    constructor() {
        this.container = new Container();
        this.container.label = 'physics-debug-overlay';
        this.container.eventMode = 'none';
        this.container.visible = false;
        this.container.zIndex = 1_010;

        this.panel = new Container();
        this.panel.eventMode = 'none';
        this.panel.position.set(PANEL_MARGIN, PANEL_MARGIN);

        this.background = new Graphics();
        this.background.eventMode = 'none';

        this.text = new Text('', createTextStyle());
        this.text.eventMode = 'none';
        this.text.position.set(PANEL_PADDING_X, PANEL_PADDING_Y);

        this.panel.addChild(this.background, this.text);
        this.container.addChild(this.panel);
    }

    getContainer(): Container {
        return this.container;
    }

    isVisible(): boolean {
        return this.container.visible;
    }

    setVisible(visible: boolean): void {
        this.container.visible = visible;
    }

    toggle(): boolean {
        this.setVisible(!this.container.visible);
        return this.container.visible;
    }

    update(state: PhysicsDebugOverlayState): void {
        const formatSpeed = (value: number) => value.toFixed(2).padStart(5, ' ');
        const formatDrift = (value: number | null | undefined): string => {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return '—';
            }
            return value.toFixed(1);
        };
        const hasSlowTime = state.slowTimeRemaining > 0 && state.slowTimeScale < 0.999;
        const regulationLine = (() => {
            if (!state.regulation || Math.abs(state.regulation.delta) < 0.01) {
                return 'Regulation: —';
            }
            const symbol = state.regulation.direction === 'boost' ? '+' : '-';
            const magnitude = Math.abs(state.regulation.delta).toFixed(2);
            return `Regulation: ${state.regulation.direction} ${symbol}${magnitude}`;
        })();

        const timeScaleLabel = hasSlowTime
            ? `Time Scale: ×${state.timeScale.toFixed(2)} (slow ×${state.slowTimeScale.toFixed(2)} | ${state.slowTimeRemaining.toFixed(1)}s)`
            : `Time Scale: ×${state.timeScale.toFixed(2)}`;

        const driftPrimary = formatDrift(state.syncDriftMs);
        const driftDetails: string[] = [];
        const driftAverage = formatDrift(state.syncDriftAverageMs);
        if (driftAverage !== '—') {
            driftDetails.push(`avg ${driftAverage} ms`);
        }
        const driftPeak = formatDrift(state.syncDriftPeakMs);
        if (driftPeak !== '—') {
            driftDetails.push(`peak ${driftPeak} ms`);
        }
        const driftLine = driftDetails.length > 0
            ? `Audio drift: ${driftPrimary} ms (${driftDetails.join(' | ')})`
            : `Audio drift: ${driftPrimary} ms`;

        const lines: string[] = [
            `Speed: ${formatSpeed(state.currentSpeed)} | base ${state.baseSpeed.toFixed(2)} | max ${state.maxSpeed.toFixed(2)}`,
            timeScaleLabel,
            regulationLine,
            `Multi-Ball: ${Math.min(state.extraBalls, state.extraBallCapacity)}/${state.extraBallCapacity}`,
            driftLine,
        ];

        this.text.text = lines.join('\n');

        const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.ceil(this.text.width + PANEL_PADDING_X * 2));
        const panelHeight = Math.ceil(this.text.height + PANEL_PADDING_Y * 2);

        this.background.clear();
        this.background.roundRect(0, 0, panelWidth, panelHeight, PANEL_CORNER_RADIUS);
        this.background.fill({ color: 0x000000, alpha: 0.68 });
        this.background.stroke({ color: 0xffffff, width: 1, alpha: 0.2 });
    }

    destroy(): void {
        this.text.destroy();
        this.background.destroy();
        this.panel.destroy();
        this.container.destroy();
    }
}
