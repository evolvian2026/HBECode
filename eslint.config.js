import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/.next/**', '**/node_modules/**', 'apps/web/public/**', '**/next-env.d.ts', 'apps/web/scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', crypto: 'readonly', AbortSignal: 'readonly', performance: 'readonly', NodeJS: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      // String-built SQL is banned outside migrations: use drizzle's parameterised builders.
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='raw'][callee.object.name='sql']", message: 'sql.raw() is not allowed: use parameterised queries.' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
    languageOptions: { globals: { window: 'readonly', document: 'readonly', location: 'readonly', localStorage: 'readonly', history: 'readonly', EventSource: 'readonly', MessageEvent: 'readonly', confirm: 'readonly' } },
  },
);
