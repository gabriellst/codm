import eslint from '@eslint/js'
import componentProps from './scripts/eslint-rules/component-props'
import componentQuality from './scripts/eslint-rules/component-quality'
import localRules from './scripts/eslint-rules/no-enum-widening'
// @ts-expect-error
import biome from 'eslint-config-biome'
import tseslint, { type ConfigArray } from 'typescript-eslint'

export default tseslint.config([
	{
		ignores: [
			'**/*.d.ts',
			'**/.astro/**',
			'**/.claude/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/.nx/**',
			'**/.output/**',
			'**/.vite/**',
			'**/build/**',
			// `**/client/**` used to sit here. It was aimed at the GENERATED SDK, but it matches any path
			// segment named `client` — so it also swallowed `packages/client/{lib,generators}`, the
			// hand-written generator that PRODUCES that SDK. The generated half is already covered by
			// `**/dist/**` (packages/client/dist/{typescript,go,rust}), so the broad pattern bought
			// nothing while hiding a real source tree from the one checker that reads types.
			'**/coverage/**',
			'**/dist/**',
			'**/examples/**',
			'**/generated/**',
			'packages/contracts/**',
			'**/node_modules/**',
			// The desktop shell's generated command bindings: `bindings.ts` is emitted by `cargo test`
			// (tauri-specta) and ships a `@ts-nocheck` header — a generator's output, not hand-written
			// source, same class as `**/generated/**`/`**/dist/**` above. The sibling `config/**` is
			// deliberately NOT ignored (it now has its own tsconfig, packages/app/tauri/tsconfig.json,
			// so the typed project service can parse it) — this entry only covers `commands/`.
			'packages/app/tauri/commands/**',
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
			local: { rules: { ...localRules.rules, ...componentQuality.rules, ...componentProps.rules } },
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
	// component-props (the className doctrine, component bp-20/bp-29) — react app only: `className` +
	// `cn()` + ComponentProps are the react/tailwind vocabulary, and the rule reads the JSX root's
	// props type, which only means something there. It lands at 'error' rather than the 'warn while we
	// burn down the backlog' convention because there IS no backlog: it evaluates 337 components
	// (283 of them in components/ui/, which the old walker could not see at all) and, after the one
	// finding it was born red on, reports zero. Route modules exempt themselves inside the rule.
	{
		files: ['packages/app/react/src/**/*.tsx'],
		ignores: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/.storybook/**'],
		rules: {
			'local/component-props': 'error',
		},
	},
	// Client-side services (.claude/skills/desktop-shell): the react console consumes capability
	// PORTS (services/<Name>Service) resolved from the DI Container injected by the ServicesProvider.
	// The tauri runtime (@tauri-apps/* or window.__TAURI__) is legal ONLY in the tauri touchpoints:
	// the Tauri*Service.ts impls, the tauri registry record, and services/utils/tauri/. Everywhere
	// else (components, routes, stores, ports, browser impls, backends) must consume the ports via
	// `@/services`, never the shell API.
	{
		files: ['packages/**/*.ts', 'packages/**/*.tsx'],
		ignores: [
			'packages/app/react/src/services/**/Tauri*Service.ts',
			'packages/app/react/src/services/registry/tauri.ts',
			'packages/app/react/src/services/utils/tauri/**',
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@tauri-apps/*'],
							message:
								'@tauri-apps/* is forbidden outside the tauri touchpoints (services/**/Tauri*Service.ts, services/registry/tauri.ts, services/utils/tauri/) — consume the service ports (@/services) instead. See .claude/skills/desktop-shell/SKILL.md.',
						},
					],
				},
			],
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
