# Data Model: Paddle Control and Ball Launch

**Feature**: Paddle Control and Ball Launch
**Date**: 2025-10-15

## Overview

This feature extends the existing game physics and rendering systems to support paddle control and ball launch mechanics. The data model focuses on the state and behavior of game objects during the positioning and launch phases.

## Core Entities

### Ball Entity

**Purpose**: Represents the game ball with physics properties and attachment state

**Fields**:
- `id`: string (unique identifier)
- `position`: Vector2 (current x,y coordinates)
- `velocity`: Vector2 (current movement vector, zero when attached)
- `isAttached`: boolean (true when ball is attached to paddle)
- `attachmentOffset`: Vector2 (relative position to paddle center when attached)
- `radius`: number (collision radius, default: 10)
- `physicsBody`: Matter.Body (reference to physics simulation body)

**Validation Rules**:
- Position must be within game boundaries
- Velocity must be zero when `isAttached` is true
- Radius must be positive number
- Attachment offset must be relative to paddle center

**State Transitions**:
- `attached` → `launching`: When launch trigger activates
- `launching` → `free`: When ball gains upward velocity
- `free` → `attached`: Reset for new round

**Relationships**:
- Belongs to: Paddle (when attached)
- References: Physics world (for body updates)

### Paddle Entity

**Purpose**: Represents the player-controlled paddle with movement constraints

**Fields**:
- `id`: string (unique identifier)
- `position`: Vector2 (current center position)
- `size`: Vector2 (width, height dimensions)
- `velocity`: Vector2 (current movement vector)
- `bounds`: Rectangle (movement constraints)
- `physicsBody`: Matter.Body (kinematic body for physics interaction)
- `lastMovedAt`: number (timestamp of last movement)

**Validation Rules**:
- Position must stay within bounds rectangle
- Size dimensions must be positive
- Velocity magnitude limited to prevent excessive speed

**State Transitions**:
- `stationary` → `moving`: When input detected
- `moving` → `stationary`: When input stops
- `moving` → `launching`: When movement exceeds threshold

**Relationships**:
- Has one: Ball (when ball is attached)
- References: Input system (for movement commands)

### Input Handler Entity

**Purpose**: Processes and normalizes user input for paddle control and launch triggers

**Fields**:
- `activeInputs`: Set<InputType> (currently active input methods)
- `mousePosition`: Vector2 (last mouse/touch position)
- `keyboardState`: Map<KeyCode, boolean> (pressed/released state)
- `paddleTarget`: Vector2 (desired paddle position)
- `launchTriggers`: Array<LaunchTrigger> (pending launch events)
- `movementThreshold`: number (pixels of movement to trigger launch)

**Validation Rules**:
- Mouse position must be within screen bounds
- Keyboard state must reflect actual key states
- Movement threshold must be positive number

**State Transitions**:
- `idle` → `positioning`: When input starts
- `positioning` → `launching`: When movement exceeds threshold
- `launching` → `idle`: After launch processed

**Relationships**:
- Controls: Paddle (position updates)
- Triggers: Ball (launch events)

## Data Flow

### Positioning Phase
1. Input Handler receives user input (mouse, keyboard, touch)
2. Input normalized to paddle target position
3. Paddle position updated (constrained to bounds)
4. Ball position synced to paddle center (if attached)
5. Movement tracked for launch threshold detection

### Launch Phase
1. Movement threshold exceeded OR tap/click detected
2. Launch trigger recorded
3. Ball velocity set to upward vector
4. Ball detached from paddle
5. Game transitions to active play state

## Validation Rules Summary

**Cross-Entity Rules**:
- When ball is attached: ball.position = paddle.position + ball.attachmentOffset
- Launch threshold: |paddle movement| > inputHandler.movementThreshold
- Boundary constraints: paddle.position ∈ paddle.bounds

**Performance Rules**:
- Position updates: ≤60 FPS (16.67ms)
- Input latency: <50ms from input to visual response
- Physics sync: Ball position updated every physics frame

## Migration Notes

**From Current State**:
- Ball currently starts with immediate velocity
- Paddle has no movement controls
- No attachment mechanics exist

**Required Changes**:
- Add attachment state to ball physics
- Implement input handling in game loop
- Add kinematic paddle body
- Sync ball position during attachment phase