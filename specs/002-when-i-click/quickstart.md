# Quickstart: Paddle Control and Ball Launch

**Feature**: Paddle Control and Ball Launch
**Date**: 2025-10-15

## Overview

This guide provides a quick start for implementing paddle control and ball launch mechanics in the Lucky Break game.

## Prerequisites

- Lucky Break project with existing physics and rendering systems
- TypeScript 5.x development environment
- Basic understanding of Matter.js and PixiJS

## Implementation Steps

### 1. Add Input System

Create `src/input/manager.ts`:

```typescript
import { InputManager, Vector2, InputType } from './contracts/input-manager';

export class GameInputManager implements InputManager {
  private container: HTMLElement | null = null;
  private mousePosition: Vector2 | null = null;
  private keyboardState = new Map<string, boolean>();
  private paddleTarget: Vector2 | null = null;
  private launchPending = false;
  private lastPaddlePosition: Vector2 | null = null;
  private readonly movementThreshold = 5;

  initialize(container: HTMLElement): void {
    this.container = container;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Mouse events
    this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.container.addEventListener('click', this.handleClick.bind(this));

    // Touch events
    this.container.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this));

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  // ... implement event handlers
}
```

### 2. Extend Physics World

Update `src/physics/world.ts` to support ball attachment:

```typescript
export interface BallAttachment {
  isAttached: boolean;
  attachmentOffset: Vector2;
  paddleId: string;
}

export class ExtendedPhysicsWorld extends PhysicsWorldHandle {
  private ballAttachments = new Map<string, BallAttachment>();

  attachBallToPaddle(ballId: string, paddlePosition: Vector2): void {
    const attachment: BallAttachment = {
      isAttached: true,
      attachmentOffset: { x: 0, y: -20 }, // Above paddle center
      paddleId: paddleId
    };
    this.ballAttachments.set(ballId, attachment);
  }

  updateBallAttachment(ballId: string, paddlePosition: Vector2): void {
    const attachment = this.ballAttachments.get(ballId);
    if (attachment?.isAttached) {
      const ballBody = this.getBodyById(ballId);
      if (ballBody) {
        const newPosition = {
          x: paddlePosition.x + attachment.attachmentOffset.x,
          y: paddlePosition.y + attachment.attachmentOffset.y
        };
        Body.setPosition(ballBody, newPosition);
        Body.setVelocity(ballBody, { x: 0, y: 0 });
      }
    }
  }

  // ... additional methods
}
```

### 3. Update Game Loop

Modify `src/app/loop.ts` to integrate input processing:

```typescript
export interface ExtendedGameLoopOptions extends GameLoopOptions {
  inputManager?: InputManager;
  paddleController?: PaddleController;
  ballController?: BallController;
}

export const createExtendedGameLoop = (options: ExtendedGameLoopOptions): GameLoopController => {
  const baseLoop = createGameLoop(options);

  return {
    ...baseLoop,
    start: () => {
      baseLoop.start();
      // Additional startup logic for input system
      options.inputManager?.initialize(options.stage.canvas.parentElement as HTMLElement);
    },
    stop: () => {
      baseLoop.stop();
      options.inputManager?.destroy();
    }
  };
};
```

### 4. Integrate with Main Game

Update `src/app/main.ts` to use the new systems:

```typescript
// In onStart callback
const inputManager = createInputManager();
const paddleController = createPaddleController();
const ballController = createBallController();

// Create paddle
const paddle = paddleController.createPaddle({
  size: { width: 100, height: 20 },
  initialPosition: { x: 640, y: 650 },
  bounds: { x: 0, y: 600, width: 1280, height: 120 }
});

// Create attached ball
const ball = ballController.createAttachedBall(paddle.position);

// Add to physics
physics.add(paddle.physicsBody);
physics.add(ball.physicsBody);

// Update loop with input processing
const loop = createExtendedGameLoop({
  world: physics,
  stage,
  inputManager,
  paddleController,
  ballController,
  hooks: {
    beforeStep: () => {
      // Process input
      const paddleTarget = inputManager.getPaddleTarget();
      if (paddleTarget) {
        paddleController.updatePosition(paddle, paddleTarget, 1/60);

        // Update ball attachment
        ballController.updateAttachment(ball, paddle.position);

        // Check for launch
        if (inputManager.shouldLaunch() ||
            paddleController.shouldTriggerLaunch(paddle, 5)) {
          ballController.launchBall(ball);
          inputManager.resetLaunchTrigger();
        }
      }
    },
    // ... existing hooks
  }
});
```

## Testing

### Unit Tests

```typescript
describe('InputManager', () => {
  it('should track mouse position', () => {
    const manager = createInputManager();
    manager.initialize(container);

    // Simulate mouse move
    const mouseEvent = new MouseEvent('mousemove', { clientX: 100, clientY: 200 });
    container.dispatchEvent(mouseEvent);

    expect(manager.getPaddleTarget()).toEqual({ x: 100, y: 200 });
  });
});

describe('BallController', () => {
  it('should attach ball to paddle', () => {
    const controller = createBallController();
    const paddlePos = { x: 640, y: 650 };

    const ball = controller.createAttachedBall(paddlePos);
    expect(controller.isAttached(ball)).toBe(true);
    expect(ball.position).toEqual({
      x: paddlePos.x,
      y: paddlePos.y - 20 // Default offset
    });
  });
});
```

### Integration Test

```typescript
describe('Paddle and Ball Integration', () => {
  it('should launch ball on paddle movement', () => {
    // Setup game state
    const inputManager = createInputManager();
    const paddleController = createPaddleController();
    const ballController = createBallController();

    // Create attached ball
    const ball = ballController.createAttachedBall({ x: 640, y: 650 });

    // Simulate paddle movement
    inputManager.simulateMouseMove({ x: 645, y: 650 }); // 5px movement

    // Process one frame
    processGameFrame();

    // Ball should launch
    expect(ballController.isAttached(ball)).toBe(false);
    expect(ball.velocity.y).toBeLessThan(0); // Moving upward
  });
});
```

## Common Issues

1. **Ball not attaching**: Ensure paddle position is updated before ball attachment sync
2. **Input lag**: Check that input processing happens in `beforeStep` hook, not `afterRender`
3. **Boundary violations**: Verify paddle bounds are correctly set for your game dimensions
4. **Launch not triggering**: Confirm movement threshold is appropriate for your input sensitivity

## Implementation Status

✅ **Complete**: All user stories implemented and tested
- US1: Ball starts at paddle position ✅
- US2: Ball launches on paddle movement or tap ✅  
- US3: Paddle movement controls ✅

## Key Components

### Input System
- `GameInputManager`: Cross-platform input handling (mouse, keyboard, touch)
- `PaddleLaunchManager`: Launch trigger detection
- Supports movement-based and tap-based launch

### Physics System
- `BallAttachmentController`: Ball attachment mechanics
- `PhysicsBallLaunchController`: Launch velocity application
- `PaddleBodyController`: Paddle kinematic body with constraints

### Integration
- Game loop processes input → updates paddle → syncs ball → checks launch
- Boundary constraints prevent paddle from leaving play area
- Ball detaches and gains physics velocity on launch