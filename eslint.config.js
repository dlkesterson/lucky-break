import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import eslintPluginImport from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));
const tsFilePatterns = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '**/*.config.ts'];
const prettierRecommendedRules = prettierConfig?.configs?.recommended?.rules ?? {};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: tsFilePatterns,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir,
      },
    },
    plugins: {
      import: eslintPluginImport,
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      ...eslintPluginImport.configs.recommended.rules,
      ...(eslintPluginImport.configs.typescript?.rules ?? {}),
      ...prettierRecommendedRules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      'import/no-default-export': 'error',
    },
  },
  {
    files: ['**/*.config.{ts,js,mjs,cjs}'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
);
