import tseslint from 'typescript-eslint';
// Initial correctness/security lint baseline, complementing strict tsc. Stylistic
// rules are intentionally not introduced across the legacy UI during this audit.
export default [{
  files: ['**/*.{ts,tsx}'],
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  rules: { 'constructor-super': 'error', 'no-async-promise-executor': 'error', 'no-constant-binary-expression': 'error',
    'no-dupe-args': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-eval': 'error',
    'no-implied-eval': 'error', 'no-unreachable': 'error', 'no-unsafe-finally': 'error', 'use-isnan': 'error',
    'valid-typeof': 'error', 'eqeqeq': 'error' },
}];