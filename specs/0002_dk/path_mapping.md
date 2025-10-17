
# Alias map (from your `src/**` folders)

Based on the repo tree, these are the roots you can import from:
`app, physics, render, audio, util, cli, input, types` .

So we’ll map:

```
app/*     → src/app/*
physics/* → src/physics/*
render/*  → src/render/*
audio/*   → src/audio/*
util/*    → src/util/*
cli/*     → src/cli/*
input/*   → src/input/*
types/*   → src/types/*
```

> Example after this change: `import { logger } from 'util/log'` instead of `../../../util/log`.

---

# 1) Update TypeScript (`tsconfig.json`)

You already have `baseUrl` set and `paths` for the `@` aliases . Replace that block with the bare aliases:

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "app/*": ["src/app/*"],
      "physics/*": ["src/physics/*"],
      "render/*": ["src/render/*"],
      "audio/*": ["src/audio/*"],
      "util/*": ["src/util/*"],
      "cli/*": ["src/cli/*"],
      "input/*": ["src/input/*"],
      "types/*": ["src/types/*"]
    }
  }
}
```

(Keep the rest of your compiler options as-is.)

---

# 2) Update Vite (`vite.config.ts`)

You currently resolve `@app`, `@util`, etc. via `resolve.alias` . Swap to the bare names:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { URL, fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  appType: "spa",
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: { input: r("./src/app/main.ts") }
  },
  resolve: {
    alias: {
      app:     r("./src/app"),
      physics: r("./src/physics"),
      render:  r("./src/render"),
      audio:   r("./src/audio"),
      util:    r("./src/util"),
      cli:     r("./src/cli"),
      input:   r("./src/input"),
      types:   r("./src/types")
    }
  },
  server: { port: 5173, strictPort: true }
});
```

(That’s the same helper you already use; we’re just changing keys.) 

---

# 3) Update Vitest (`vitest.config.ts`)

Vitest mirrors the same alias config; you currently point `@app`, `@util`, etc. . Switch to the bare names:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const r = (p: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), p);

export default defineConfig({
  resolve: {
    alias: {
      app:     r('src/app'),
      physics: r('src/physics'),
      render:  r('src/render'),
      audio:   r('src/audio'),
      util:    r('src/util'),
      cli:     r('src/cli'),
      input:   r('src/input'),
      types:   r('src/types'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
```

---

# 4) ESLint (FYI)

You’re using the TS resolver (`settings['import/resolver'].typescript: true`), so ESLint will follow TS path aliases automatically—no extra changes needed .

---

# 5) Quick find/replace tips

* Change imports like `import x from '@util/log'` → `import x from 'util/log'`.
* VS Code: **Cmd/Ctrl+Shift+P → “TypeScript: Restart TS Server”** after edits.
* If you publish a package later, consider **prefixing** aliases (e.g. `~util/*` or `#util/*`) to avoid collisions with real npm package names. Using bare names like `util/*` is convenient but *could* clash with a package named `util`. If you want safety + shortness, choose `~app/*`, `~util/*`, etc. (Same steps as above, just change the keys.)

---

# Sanity check (what you’ll see)

* In app code: `import { createWorld } from 'physics/world'`
* In tests: `import { createStage } from 'render/stage'` (your tests already import via alias, just adjust key) .

If you’d rather **keep the existing `@` aliases** (which are already working end-to-end across Vite, Vitest, and TS), you can also **add** the bare aliases alongside them for a transition period. Just include both keys in `paths`, `vite.config.ts`, and `vitest.config.ts`.
