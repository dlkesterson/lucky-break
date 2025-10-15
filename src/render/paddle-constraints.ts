/**
 * Paddle Boundary Constraints
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Implements boundary constraints for paddle movement
 */

import type { Vector2, Rectangle } from './contracts';

export interface BoundaryConstraints {
    /**
     * Constrain a position within the given bounds
     * @param position - Position to constrain
     * @param bounds - Boundary rectangle
     * @returns Constrained position
     */
    constrainToBounds(position: Vector2, bounds: Rectangle): Vector2;

    /**
     * Check if a position is within bounds
     * @param position - Position to check
     * @param bounds - Boundary rectangle
     * @returns True if position is within bounds
     */
    isWithinBounds(position: Vector2, bounds: Rectangle): boolean;

    /**
     * Get the distance to boundary in a given direction
     * @param position - Current position
     * @param direction - Direction vector (normalized)
     * @param bounds - Boundary rectangle
     * @returns Distance to boundary, or Infinity if no boundary in that direction
     */
    distanceToBoundary(position: Vector2, direction: Vector2, bounds: Rectangle): number;
}

export class PaddleBoundaryConstraints implements BoundaryConstraints {
    constrainToBounds(position: Vector2, bounds: Rectangle): Vector2 {
        const constrainedX = Math.max(
            bounds.x,
            Math.min(bounds.x + bounds.width, position.x)
        );

        const constrainedY = Math.max(
            bounds.y,
            Math.min(bounds.y + bounds.height, position.y)
        );

        return {
            x: constrainedX,
            y: constrainedY,
        };
    }

    isWithinBounds(position: Vector2, bounds: Rectangle): boolean {
        return position.x >= bounds.x &&
            position.x <= bounds.x + bounds.width &&
            position.y >= bounds.y &&
            position.y <= bounds.y + bounds.height;
    }

    distanceToBoundary(position: Vector2, direction: Vector2, bounds: Rectangle): number {
        // Normalize direction
        const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
        if (length === 0) {
            return Infinity;
        }

        const normalizedDir = {
            x: direction.x / length,
            y: direction.y / length,
        };

        let minDistance = Infinity;

        // Check each boundary
        const boundaries = [
            // Left boundary
            normalizedDir.x < 0 ? (bounds.x - position.x) / normalizedDir.x : Infinity,
            // Right boundary
            normalizedDir.x > 0 ? ((bounds.x + bounds.width) - position.x) / normalizedDir.x : Infinity,
            // Top boundary
            normalizedDir.y < 0 ? (bounds.y - position.y) / normalizedDir.y : Infinity,
            // Bottom boundary
            normalizedDir.y > 0 ? ((bounds.y + bounds.height) - position.y) / normalizedDir.y : Infinity,
        ];

        for (const distance of boundaries) {
            if (distance > 0 && distance < minDistance) {
                minDistance = distance;
            }
        }

        return minDistance;
    }
}