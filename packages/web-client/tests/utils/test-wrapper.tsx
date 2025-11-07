import { type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../src/i18n';

/**
 * Wraps a React component with I18nextProvider for testing.
 * This ensures that all i18n translation keys are resolved to their English text.
 *
 * Usage:
 * ```ts
 * import { wrapWithI18n } from '../utils/test-wrapper';
 *
 * render(wrapWithI18n(<YourComponent />), container);
 * ```
 */
export const wrapWithI18n = (element: ReactElement): ReactElement => {
  return <I18nextProvider i18n={i18n}>{element}</I18nextProvider>;
};
