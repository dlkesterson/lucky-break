# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by `pnpm`; application code lives in `packages/*`.
- `packages/web-client` hosts the Pixi-based browser game, with scenes, audio, and rendering code under `src/` plus Playwright/Vitest suites in `tests/`.
- `packages/core-domain` contains shared physics, state, and utility modules consumed by both the web client and CLI simulator.
- `packages/design-system` provides shared React UI components, Tailwind tokens, and Storybook documentation for HUD overlays.
- `packages/cli-sim` wraps the domain for headless simulations; scripts supporting CI live in `scripts/`.
- Generated assets (`dist/`, `coverage/`, `test-results/`) are disposable—do not commit them.

## Build, Test & Development Commands
- `pnpm install` to sync workspace dependencies.
- `pnpm dev` spins up the web client via Vite with the default aliases configured.
- `pnpm build` produces a production bundle for the web client.
- `pnpm test`, `pnpm test:coverage`, and `pnpm test:e2e` run Vitest unit coverage and Playwright end-to-end suites respectively.
- `pnpm lint`, `pnpm lint:fix`, and `pnpm typecheck` keep the TypeScript surface clean; `pnpm simulate:verify` validates CLI runs, and `pnpm ci` executes the full gate.
- `pnpm --filter @lucky-break/design-system storybook` launches the Storybook component workbench locally.

## Coding Style & Naming Conventions
- Use TypeScript with four-space indentation and file-scoped `import` order enforced by ESLint.
- Export named symbols—`import/no-default-export` errors on default exports except in configs.
- Follow existing folder aliases (`app`, `render`, `physics`, etc.) instead of relative paths.
- Run `pnpm lint:fix` or local Prettier (`pnpm --filter @lucky-break/web-client format`) before submitting.

## Testing Guidelines
- Unit and integration specs reside in `packages/web-client/tests/{unit,integration}` and should end in `.spec.ts` to be collected by Vitest.
- Maintain coverage expectations (80% statements/lines, 75% branches/functions) as set in `vitest.config.ts`.
- E2E scenarios live in `packages/web-client/tests/e2e` and execute with Playwright; record failing traces via `npx playwright show-trace` before filing bugs.
- For CLI or domain changes, add minimal reproduction scripts under `packages/cli-sim/tests` and wire them into `simulate:verify` when feasible.

## Commit & Pull Request Guidelines
- Commit history uses terse numeric summaries (e.g., `98`); mirror that convention unless maintainers request otherwise, and include full context in the PR body.
- Scope commits to a single concern and ensure lint/type/test suites pass locally before pushing.
- Pull requests should describe behavioral changes, reference tracking issues, and attach screenshots or replay seeds for UI/gameplay tweaks.
- Note any follow-up tasks or architectural impacts to help reviewers plan subsequent work.
