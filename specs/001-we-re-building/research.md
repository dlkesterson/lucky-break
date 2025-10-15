# Research Findings — Lucky Break Core Experience

## PixiJS Rendering + Matter.js Physics
- **Decision**: Drive a fixed-step Matter.js engine at 120 Hz and flush positions into PixiJS display objects during the render loop using shared state adapters.
- **Rationale**: Separating physics integration from rendering avoids drift, keeps deterministic collisions, and mirrors established Pixi/Matter integrations used in performance-sensitive arcade titles.
- **Alternatives considered**: Hooking Pixi ticker directly to Matter caused frame-dependent physics on low-end devices; running Matter inside Pixi's ticker with variable dt increased tunneling. A custom physics engine lacked maturity and tooling.

## Tone.js Musical Scheduling
- **Decision**: Use Tone.Transport with a 120 ms look-ahead and bar-quantized callbacks, mapping rally metrics to scene state and applying transitions on the next measure.
- **Rationale**: Transport scheduling guarantees musically coherent timing while allowing expressive scene changes; the 120 ms window matches Tone best practices for cross-browser reliability.
- **Alternatives considered**: Manual `AudioContext` scheduling demanded bespoke beat tracking; Web Audio `setTimeout` control was too jittery; a third-party adaptive music service would add dependencies and network latency.

## Asset Loading & Vite Bundling
- **Decision**: Keep SampleSwap WAV assets outside the JS bundle, expose them through a Vite static manifest, and lazy-load non-critical audio/texture groups post-boot.
- **Rationale**: Preserves fast initial load, respects licensing, and lets the preloader surface combined progress while allowing expandable content later.
- **Alternatives considered**: Embedding audio as data URIs bloated bundles and delayed first paint; CDN streaming required additional infra and added latency for offline play.

## Headless Simulation & CLI Automation
- **Decision**: Implement a Node-based CLI that spins up the physics/audio subsystems in headless mode using PixiJS's `@pixi/canvas` adapter and Tone mocks, enabling deterministic regression runs without browser automation.
- **Rationale**: Satisfies the Constitution's CLI requirement, supports automated testing, and reuses production modules without branching logic.
- **Alternatives considered**: Browser automation suites added maintenance overhead while duplicating logic exercised through Vitest-driven simulations.

## Testing Strategy Alignment
- **Decision**: Standardize on Vitest (jsdom) for unit and interaction tests across gameplay, audio scheduling, and renderer adapters.
- **Rationale**: Aligns with the updated Constitution mandate, keeps feedback loops fast, and leverages existing TypeScript tooling.
- **Alternatives considered**: Jest lacked desired TypeScript ergonomics; Cypress and Playwright exceeded the project's required scope under the new testing policy.
