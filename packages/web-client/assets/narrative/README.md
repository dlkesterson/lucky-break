# Narrative Asset Guide

These placeholder assets document how narrative content is organized for the Mayhaps cosmic casino experience. Runtime loaders read from this structure so writers can iterate without touching code.

## Directory Layout

- `intro/` – multi-step onboarding copy for the first-launch cinematic and optional "Story" replay.
- `in-game/` – short callouts surfaced in the HUD during active play.
- `idle/` – templates used for Fate Ledger journal entries and idle return stories.

## Asset Notes

### intro/

`prologue.md`
: Establishes Mayhaps and the cosmic casino premise.

`oath.md`
: Encourages the player to embrace risk and introduces the Lucky Architect.

### in-game/

`paddle-flavor.txt`
: Single-line reactions that fire on paddle contacts. Keep lines punchy (<80 chars).

`combo-flavor.txt`
: Templates with `{{combo}}` placeholder for combo milestone alerts. Keep copy celebratory.

### idle/

`fate-ledger-templates.json`
: JSON document splitting idle-story templates into `intro`, `action`, and `coda` fragments. Numbers like `{{entropy}}` or `{{dust}}` are replaced at runtime.

---

All assets are plain text to simplify tooling. Runtime code trims whitespace, so writers can wrap naturally. Additions should stay in ASCII unless a justification demands extended characters.
