<!--

Sync Impact Report

Version change: 1.0.0 -> 2.0.0

Modified principles:
- III. Test-First (NON-NEGOTIABLE) -> III. Vitest Unit Tests (NON-NEGOTIABLE)
- IV. Integration Testing -> IV. Observability, Versioning & Simplicity (scope clarified)

Added sections:
- None

Removed sections:
- None (Integration Testing principle redefined rather than removed)

Templates reviewed (alignment status):
- .specify/templates/plan-template.md: ✅ updated
- .specify/templates/spec-template.md: ✅ aligns (no changes required)
- .specify/templates/tasks-template.md: ✅ updated
- .specify/templates/agent-file-template.md: ⚠ pending manual review
- .specify/templates/commands/*.md: ⚠ none found; confirm later

Follow-up TODOs:
- TODO(RATIFICATION_DATE): original adoption date unknown — please supply the ratification date or confirm using the last amended date.
-->

# lucky-break Constitution

## Core Principles

### I. Library-First
Every feature and unit of functionality MUST be implemented as a reusable library or module. Libraries
MUST be self-contained, independently testable, and documented with a clear public API. Projects MUST
avoid creating "organizational-only" libraries without a clear, external-facing purpose.

### II. CLI Interface
All libraries SHOULD expose a command-line interface (CLI) or thin adapter to allow automation,
reproducible experiments, and easy debugging. The standard runtime protocol MUST be: arguments/stdin
→ stdout for normal output and stderr for errors. Output formats MUST include machine-parseable
JSON and a human-readable representation when appropriate.

### III. Vitest Unit Tests (NON-NEGOTIABLE)
All production code MUST be driven by unit tests authored with Vitest using the jsdom environment.
Tests MUST be written before implementation (or exceptions documented), MUST fail before code
changes, and MUST run in CI. End-to-end or browser automation suites are optional and outside the
governance scope.

### IV. Observability, Versioning & Simplicity
Projects MUST include structured logging and basic metrics to support observability. Text-based I/O
and clear error reporting are required to make debugging straightforward. Versioning MUST follow
semantic versioning (MAJOR.MINOR.PATCH): MAJOR for breaking changes, MINOR for new backwards-
compatible functionality, PATCH for fixes and clarifications. Prefer simple designs (YAGNI). Breaking
changes MUST be accompanied by a migration plan and documented in the release notes.

## Additional Constraints

- Technology: The project is language-agnostic; choose tools that minimize operational surface area and
  dependency bloat. Any new major dependency MUST be justified in the plan.md and approved in review.
- Testing: Only Vitest unit tests running under jsdom are required; other testing layers are optional.
- Security: Sensitive data MUST be handled per best practices: secrets never committed, encrypted at rest
  where required, and access controls documented. Security-related changes MUST include threat
  modeling and tests where applicable.
- Performance: Performance targets are defined per-feature in plan.md. When unspecified, aim for
  reasonable defaults and document assumptions in the plan.

## Development Workflow

- Feature work MUST start with a spec.md and plan.md that reference the Constitution Check section.
- Pull requests MUST include: scope of change, tests added/updated, impact on public contracts, and any
  migration steps for breaking changes. At least one approving review from a project maintainer is
  REQUIRED before merging.
- Quality gates: All CI checks (unit tests, integration/contract tests, linters) MUST pass before merge.

## Governance

Amendments to this Constitution follow a documented process to ensure stability and traceability:

1. Propose: Open a PR that edits this file and includes a clear rationale, test changes, and a
   migration plan for any breaking governance changes.
2. Review: The proposal MUST be reviewed and approved by at least two maintainers or by consensus of
   the core team when more than two maintainers exist. Reviews MUST record objections and mitigation
   plans in the PR discussion.
3. Ratify: After approval, merge the PR and update the Constitution version following the versioning
   policy below. If the ratification date is not known, set TODO(RATIFICATION_DATE) and record the
   ratification in the PR description.

Versioning policy for the Constitution:

- CONSTITUTION_VERSION follows semantic versioning (MAJOR.MINOR.PATCH).
- Bump MAJOR for backward-incompatible governance or principle removals/redefinitions.
- Bump MINOR when adding new principles or materially expanding guidance.
- Bump PATCH for clarifications, wording fixes, or non-substantive refinements.

Compliance reviews:

- All feature plans (plan.md) MUST include a "Constitution Check" section that lists which principles
  apply and how compliance is achieved.
- Periodic compliance audits SHOULD be scheduled (owner decided by core team) and documented in the
  repository under docs/compliance/ when available.

**Version**: 2.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date unknown | **Last Amended**: 2025-10-15