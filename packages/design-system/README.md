# @lucky-break/design-system

Shared React component library for Lucky Break HUD overlays, powered by Tailwind CSS and shadcn-inspired primitives.

## Usage

```ts
import { Button } from '@lucky-break/design-system';

<Button variant="subtle">Continue</Button>;
```

### Tailwind setup

Add the preset to your consuming application (already wired for `@lucky-break/web-client`):

```ts
// tailwind.config.ts
import preset from '@lucky-break/design-system/tailwind-preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
};
```

Import the shared tokens once near your entry point:

```ts
import '@lucky-break/design-system/styles.css';
```

Wrap your React tree to register the root theme class:

```tsx
import { DesignSystemProvider } from '@lucky-break/design-system';

const Root = () => (
  <DesignSystemProvider>
    {/* hud overlays */}
  </DesignSystemProvider>
);
```

## Storybook

Run the component workbench locally from the repo root:

```bash
pnpm --filter @lucky-break/design-system storybook
```

Generate a static bundle for visual regression pipelines with:

```bash
pnpm --filter @lucky-break/design-system build-storybook
```
