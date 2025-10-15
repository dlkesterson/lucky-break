/**
 * Input handling module for paddle control and ball launch mechanics
 *
 * This module provides cross-platform input handling for mouse, keyboard, and touch
 * interactions, including paddle movement and launch trigger detection.
 */

// Export types and interfaces
export type { InputManager, InputDebugState, InputType, Vector2 } from './contracts';

// Export implementations
export { GameInputManager } from './input-manager';
export { PaddleLaunchManager } from './launch-manager';