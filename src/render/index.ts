/**
 * Render Module Exports
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Central export point for rendering functionality
 */

export * from './contracts';
export {
    createSceneManager,
    type SceneManagerConfig,
    type SceneManagerHandle,
    type SceneContext,
    type Scene,
    type SceneFactory,
    type SceneRegistrationOptions,
    type SceneLayerName,
    type StageLayers,
    type SceneTransitionOptions,
    type SceneTransitionEffect,
} from './scene-manager';
export { createStage, type StageConfig, type StageHandle } from './stage';
export * from './hud';
export * from './debug-overlay';