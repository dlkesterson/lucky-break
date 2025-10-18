/**
 * Geometry Utilities
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Utility functions for 2D geometry operations
 */

import type { Vector2, Rectangle } from '../types';

/**
 * Create a new Vector2
 */
export function createVector2(x = 0, y = 0): Vector2 {
    return { x, y };
}

/**
 * Add two vectors
 */
export function addVectors(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract vector b from vector a
 */
export function subtractVectors(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Multiply vector by scalar
 */
export function multiplyVector(vector: Vector2, scalar: number): Vector2 {
    return { x: vector.x * scalar, y: vector.y * scalar };
}

/**
 * Calculate distance between two points
 */
export function distance(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize a vector (make it unit length)
 */
export function normalizeVector(vector: Vector2): Vector2 {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
}

/**
 * Calculate dot product of two vectors
 */
export function dotProduct(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
}

/**
 * Create a new Rectangle
 */
export function createRectangle(x = 0, y = 0, width = 0, height = 0): Rectangle {
    return { x, y, width, height };
}

/**
 * Check if a point is inside a rectangle
 */
export function pointInRectangle(point: Vector2, rect: Rectangle): boolean {
    return point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height;
}

/**
 * Get the center point of a rectangle
 */
export function rectangleCenter(rect: Rectangle): Vector2 {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
    };
}

/**
 * Check if two rectangles intersect
 */
export function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
    return !(a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Convert degrees to radians
 */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}