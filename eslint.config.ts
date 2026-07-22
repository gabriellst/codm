import eslint from '@eslint/js'
import componentQuality from './scripts/eslint-rules/component-quality'
import localRules from './scripts/eslint-rules/no-enum-widening'
// @ts-expect-error
import biome from 'eslint-config-biome'
import tseslint, { type ConfigArray } from 'typescript-eslint'

export default tseslint.config([
	{
		ignores: [
			'**/.astro/**',
			'**/.claude/**',
			'**/.expo/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/.nx/**',
			'**/.output/**',
			'**/.vite/**',
			'**/build/**',
			'**/client/**',
			'**/coverage/**',
			'**/dist/**',
			'**/examples/**',
			'**/generated/**',
			'packages/contracts/**',
			'**/node_modules/**',
			'**/playwright-report/**',
			'**/public/**',
			'**/recordings/**',
			'**/routeTree.gen.ts',
			'**/scripts/**',
			'**/storybook-static/**',
			'**/test-results/**',
		],
	},
	eslint.configs.recommended,
	// TS files (typed linting — files outside tsconfig projects are linted untyped below)
	{
		files: ['**/*.ts', '**/*.tsx'],
		ignores: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/.storybook/**', '**/*.config.ts', '**/eslint.config.ts'],
		extends: [tseslint.configs.strict, tseslint.configs.stylistic],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				projectService: true,
			},
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
			local: { rules: { ...localRules.rules, ...componentQuality.rules } },
		},
		rules: {
			'local/no-enum-widening': 'error',
			'local/no-raw-enum-render': ['error', { allowTypes: ['CurrencyCodeEnumKey'] }],
			// component-quality (warn while we measure/burn down the existing backlog → ratchet to error)
			'local/button-needs-handler': 'warn',
			'local/no-hardcoded-jsx-text': 'error',
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/array-type': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-confusing-void-expression': 'off',
			'@typescript-eslint/no-duplicate-enum-values': 'off',
			'@typescript-eslint/no-dynamic-delete': 'warn',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-empty-function': 'warn',
		},
	},
	// TS files OUTSIDE tsconfig projects (tests, stories, config, storybook): syntactic
	// TS parsing only — typed rules don't apply; biome + tsc own their correctness.
	{
		files: [
			'**/*.test.ts',
			'**/*.test.tsx',
			'**/*.spec.ts',
			'**/*.spec.tsx',
			'**/*.stories.ts',
			'**/*.stories.tsx',
			'**/.storybook/**/*.ts',
			'**/.storybook/**/*.tsx',
			'**/*.config.ts',
			'**/eslint.config.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'no-undef': 'off', // tsc owns undefined identifiers in TS files
		},
	},
	// JS files
	{
		files: ['**/*.js', '**/*.jsx'],
	},
	// Test files
	{
		files: [
			'**/*.spec.js',
			'**/*.spec.ts',
			'**/*.test.js',
			'**/*.test.ts',
			'**/*.spec.jsx',
			'**/*.spec.tsx',
			'**/*.test.jsx',
			'**/*.test.tsx',
		],
		extends: [],
		languageOptions: {},
		plugins: {},
		rules: {
			'jest/no-commented-out-tests': 'off',
			'jest/no-deprecated-functions': 'off',
			'jest/unbound-method': 'off',
		},
		settings: {
			jest: {
				globalPackage: 'bun:test',
			},
		},
	},
	{
		extends: [biome],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/require-await': 'off',
			'jest/max-nested-describe': 'off',
			'jest/no-disabled-tests': 'off',
			'jest/no-done-callback': 'off',
			'jest/no-duplicate-hooks': 'off',
			'jest/no-export': 'off',
			'jest/no-focused-tests': 'off',
			'jest/no-standalone-expect': 'off',
			'sort-imports': 'off',
		},
	},
]) as unknown as ConfigArray
