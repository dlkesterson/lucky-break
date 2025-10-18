/**
 * Input Debug Overlay
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Provides visual debugging overlay for input and paddle state
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameInputManager } from 'input/input-manager';
import type { PaddleBodyController } from './paddle-body';
import type { Paddle } from './contracts';
import type { BallAttachmentController } from 'physics/ball-attachment';
import type { Ball } from 'physics/contracts';

export interface DebugOverlayOptions {
    inputManager: GameInputManager;
    paddleController: PaddleBodyController;
    ballController: BallAttachmentController;
    paddle: Paddle;
    ball: Ball;
}

export class InputDebugOverlay {
    private container: Container;
    private textElements: Text[] = [];
    private graphics: Graphics;
    private options: DebugOverlayOptions;

    constructor(options: DebugOverlayOptions) {
        this.options = options;
        this.container = new Container();
        this.graphics = new Graphics();
        this.container.addChild(this.graphics);

        this.createTextElements();
        this.update();
    }

    private createTextElements(): void {
        const style = new TextStyle({
            fontFamily: 'monospace',
            fontSize: 12,
            fill: 0xffffff,
        });

        const labels = [
            'Input State',
            'Paddle Position',
            'Ball State',
            'Launch Status',
        ];

        labels.forEach((label, index) => {
            const text = new Text(label, style);
            text.x = 10;
            text.y = 10 + index * 20;
            this.textElements.push(text);
            this.container.addChild(text);
        });
    }

    update(): void {
        const inputState = this.options.inputManager.getDebugState();
        const paddleDebug = this.options.paddleController.getDebugInfo(this.options.paddle);
        const ballDebug = this.options.ballController.getDebugInfo(this.options.ball);

        // Update text elements
        if (this.textElements.length >= 4) {
            this.textElements[0].text = `Input: ${inputState.activeInputs.join(', ')} | Mouse: ${inputState.mousePosition ? `(${inputState.mousePosition.x}, ${inputState.mousePosition.y})` : 'none'} | Launch: ${inputState.launchPending}`;
            this.textElements[1].text = `Paddle: (${paddleDebug.position.x.toFixed(1)}, ${paddleDebug.position.y.toFixed(1)}) | Bounds: ${paddleDebug.bounds.x}-${paddleDebug.bounds.x + paddleDebug.bounds.width}`;
            this.textElements[2].text = `Ball: ${ballDebug.isAttached ? 'Attached' : 'Free'} | Pos: (${ballDebug.position.x.toFixed(1)}, ${ballDebug.position.y.toFixed(1)}) | Vel: (${ballDebug.velocity.x.toFixed(1)}, ${ballDebug.velocity.y.toFixed(1)})`;
            this.textElements[3].text = `Launch: ${inputState.launchPending ? 'Pending' : 'Ready'} | Offset: (${ballDebug.attachmentOffset.x.toFixed(1)}, ${ballDebug.attachmentOffset.y.toFixed(1)})`;
        }

        // Update graphics
        this.graphics.clear();

        // Draw paddle bounds
        this.graphics.setStrokeStyle({ width: 1, color: 0x00ff00, alpha: 0.5 });
        this.graphics.rect(
            paddleDebug.bounds.x,
            paddleDebug.bounds.y,
            paddleDebug.bounds.width,
            paddleDebug.bounds.height
        );
        this.graphics.stroke();

        // Draw paddle center
        this.graphics.setFillStyle({ color: 0x00ff00, alpha: 0.8 });
        this.graphics.circle(paddleDebug.position.x, paddleDebug.position.y, 3);
        this.graphics.fill();

        // Draw ball position
        this.graphics.setFillStyle({ color: 0xff0000, alpha: 0.8 });
        this.graphics.circle(ballDebug.position.x, ballDebug.position.y, 5);
        this.graphics.fill();

        // Draw attachment line if attached
        if (ballDebug.isAttached) {
            this.graphics.setStrokeStyle({ width: 2, color: 0xffff00, alpha: 0.8 });
            this.graphics.moveTo(paddleDebug.position.x, paddleDebug.position.y);
            this.graphics.lineTo(ballDebug.position.x, ballDebug.position.y);
            this.graphics.stroke();
        }

        // Draw input cursor position
        if (inputState.mousePosition) {
            this.graphics.setFillStyle({ color: 0x0000ff, alpha: 0.6 });
            this.graphics.circle(inputState.mousePosition.x, inputState.mousePosition.y, 4);
            this.graphics.fill();
        }
    }

    getContainer(): Container {
        return this.container;
    }

    destroy(): void {
        this.graphics.destroy();
        this.textElements.forEach(text => text.destroy());
        this.container.destroy();
    }
}