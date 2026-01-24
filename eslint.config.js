import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TypeScript specific rules - relaxed for existing codebase
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Too many existing uses
      '@typescript-eslint/no-non-null-assertion': 'off', // Common pattern in codebase
      '@typescript-eslint/no-empty-object-type': 'off', // Allow empty interfaces

      // General rules
      'no-console': 'off', // Allow console for MCP server logging
      'prefer-const': 'warn', // Warn instead of error
      'no-var': 'error',
      'no-case-declarations': 'off', // Allow declarations in case blocks
      'no-empty': 'warn', // Warn instead of error
      'no-useless-escape': 'warn', // Warn instead of error
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.cjs', '*.mjs'],
  }
);

