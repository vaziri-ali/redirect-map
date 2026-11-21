import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      curly: ['error', 'multi-line'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
