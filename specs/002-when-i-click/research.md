# Research: Paddle Control and Ball Launch

**Feature**: Paddle Control and Ball Launch
**Date**: 2025-10-15
**Status**: Complete

## Research Tasks Completed

### Task 1: Ball Attachment Mechanics in Matter.js
**Objective**: Research how to implement ball attachment to paddle until launch

**Decision**: Use kinematic body for paddle and dynamic body for ball, with position synchronization
**Rationale**: Matter.js kinematic bodies can be moved programmatically while still participating in collisions. Ball remains dynamic but position is manually synced to paddle until launch.
**Alternatives considered**:
- Constraint joints: Too complex for simple attachment, overkill for this use case
- Static positioning: Ball wouldn't participate in physics until launch
- Manual collision detection: Would require custom physics logic

### Task 2: Input Event Handling in PixiJS
**Objective**: Research cross-platform input handling (mouse, keyboard, touch) for paddle control

**Decision**: Use PixiJS interaction events with unified input abstraction layer
**Rationale**: PixiJS provides normalized input events that work across platforms. Create input manager to translate events to paddle movement.
**Alternatives considered**:
- Direct DOM events: Would bypass PixiJS rendering context
- Third-party input libraries: Unnecessary complexity for simple paddle control
- Pointer events only: Would miss keyboard accessibility

### Task 3: Launch Trigger Detection
**Objective**: Research how to detect paddle movement vs positioning to trigger ball launch

**Decision**: Track paddle position changes and use movement threshold to distinguish positioning from launch
**Rationale**: Simple velocity-based detection - if paddle moves more than threshold distance, trigger launch. Allows precise positioning before launch.
**Alternatives considered**:
- Time-based delay: Would feel unresponsive
- Separate positioning mode: Adds UI complexity
- Gesture recognition: Overkill for simple left/right movement

### Task 4: Cross-Platform Input Normalization
**Objective**: Research input normalization for mouse, keyboard, and touch across devices

**Decision**: Create input abstraction that maps all input types to paddle position updates
**Rationale**: Single input handler can process mouse position, keyboard arrows, and touch coordinates uniformly, then apply to paddle physics body.
**Alternatives considered**:
- Platform-specific handlers: Would duplicate logic
- Input libraries: Not needed for simple paddle control
- Pointer capture: Too complex for game input

## Technical Approach

### Ball-Paddle Attachment Implementation
- Ball starts with zero velocity, positioned at paddle center
- During positioning phase: Ball position manually synced to paddle center each frame
- Launch triggers: Paddle movement > threshold OR screen tap/click
- Post-launch: Ball becomes fully dynamic with upward velocity component

### Input System Architecture
- Input manager captures PixiJS interaction events
- Events normalized to paddle position deltas
- Position applied to kinematic paddle body
- Boundary constraints prevent paddle from leaving play area

### Launch Mechanics
- Movement threshold: 5 pixels of paddle movement
- Launch velocity: Configurable upward vector (default: 0, -10)
- Launch can be triggered by any input method (mouse, keyboard, touch)

## Dependencies & Integrations

**Existing Dependencies Used**:
- Matter.js: Physics simulation for ball and paddle bodies
- PixiJS: Input event handling and rendering
- TypeScript: Type safety for input and physics interfaces

**No new dependencies required** - all functionality can be implemented with existing stack.

## Performance Considerations

- Input processing: <1ms per frame (negligible)
- Physics updates: Already optimized in existing loop
- Rendering: No additional visual elements needed
- Memory: Minimal additional objects (input state tracking)

## Testing Strategy

- Unit tests for input normalization logic
- Integration tests for ball launch mechanics
- Physics simulation tests for attachment behavior
- Cross-platform input validation