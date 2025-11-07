import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '../../i18n';

import { UiRoot } from '../UiRoot';

let reactRoot: Root | null = null;

const mountHud = (container: HTMLElement): void => {
  if (reactRoot !== null) {
    return;
  }

  reactRoot = createRoot(container);
  reactRoot.render(
    <StrictMode>
      <UiRoot />
    </StrictMode>,
  );
};

export const initializeReactUi = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const container = document.getElementById('ui-root');
  if (!container) {
    if (import.meta.env.DEV) {
      console.warn('[ui] #ui-root not found; React HUD unavailable');
    }
    return;
  }

  mountHud(container);
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    reactRoot?.unmount();
    reactRoot = null;
  });
}
