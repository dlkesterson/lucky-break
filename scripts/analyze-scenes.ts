#!/usr/bin/env tsx
/**
 * Scene Component Analyzer
 * 
 * Analyzes game scenes and suggests how to extract presentational components
 * for better testability and Storybook integration.
 * 
 * Usage:
 *   npx tsx scripts/analyze-scenes.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCENES_DIR = join(process.cwd(), 'packages/web-client/src/ui/scenes');

interface SceneAnalysis {
    readonly file: string;
    readonly hooks: readonly string[];
    readonly props: readonly string[];
    readonly complexity: number;
}

const analyzeScene = (filePath: string): SceneAnalysis | null => {
    try {
        const content = readFileSync(filePath, 'utf-8');

        // Find hooks used
        const hookPattern = /use[A-Z]\w+/g;
        const hooks = Array.from(new Set(content.match(hookPattern) || []));

        // Find props destructured
        const propsPattern = /export\s+const\s+\w+\s*=\s*\([^)]*\):\s*JSX\.Element/;
        const propsMatch = content.match(propsPattern);
        const props = propsMatch ? propsMatch[0].match(/\w+(?=,|\s*\})/g) || [] : [];

        // Estimate complexity by line count, hook count, and JSX depth
        const lines = content.split('\n').length;
        const jsxDepth = (content.match(/<[A-Z]/g) || []).length;
        const complexity = lines + (hooks.length * 20) + (jsxDepth * 2);

        return {
            file: filePath.split(/[/\\]/).pop() || filePath,
            hooks,
            props,
            complexity,
        };
    } catch (error) {
        console.error(`Failed to analyze ${filePath}:`, error);
        return null;
    }
};

const main = () => {
    console.log('🔍 Analyzing game scenes...\n');

    const files = readdirSync(SCENES_DIR)
        .filter((file) => file.endsWith('.tsx') && !file.endsWith('.spec.tsx'));

    const analyses: SceneAnalysis[] = [];

    for (const file of files) {
        const filePath = join(SCENES_DIR, file);
        const analysis = analyzeScene(filePath);
        if (analysis) {
            analyses.push(analysis);
        }
    }

    // Sort by complexity (descending)
    analyses.sort((a, b) => b.complexity - a.complexity);

    console.log('📊 Scene Complexity Report:\n');
    console.log('File                    | Hooks | Props | Complexity | Recommendation');
    console.log('------------------------|-------|-------|------------|---------------');

    for (const analysis of analyses) {
        const recommendation =
            analysis.complexity > 500 ? '🔴 Extract ASAP' :
                analysis.complexity > 300 ? '🟡 Consider refactor' :
                    '🟢 OK as-is';

        console.log(
            `${analysis.file.padEnd(24)}| ${String(analysis.hooks.length).padEnd(6)}| ${String(analysis.props.length).padEnd(6)}| ${String(analysis.complexity).padEnd(11)}| ${recommendation}`
        );
    }

    console.log('\n📋 Refactoring Suggestions:\n');

    for (const analysis of analyses.filter((a) => a.complexity > 300)) {
        console.log(`\n${analysis.file}:`);
        console.log(`  • ${analysis.hooks.length} hooks detected: ${analysis.hooks.join(', ')}`);
        console.log(`  • Suggestion: Extract presentational component`);
        console.log(`    - Create ${analysis.file.replace('.tsx', 'View.tsx')}`);
        console.log(`    - Move JSX logic to view component`);
        console.log(`    - Keep hooks in container component`);
    }

    console.log('\n✅ Analysis complete!\n');
};

main();
