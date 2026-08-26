// Pre-commit lint-staged config.
//
// Generated output (`**/dist/**`, `**/generated/**`) is already ignored by both
// biome (biome.jsonc `!!**/dist`) and eslint (eslint.config.ts `**/dist/**`), so
// linting it is a no-op — but lint-staged still passes every staged path to the
// linters explicitly, and feeding hundreds of generated files to `eslint` at once
// OOM-kills the spawn (SIGKILL). Filtering generated paths out of the file list
// keeps SDK/contract regen commits (which touch 100+ generated files) committable.
const isGenerated = (p) => p.includes('/dist/') || p.includes('/generated/')
// Feature-loop injection payloads: package-shaped test files that live OUTSIDE the workspace
// tsconfig graph (scripts/skill-evals/features/) — typed eslint OOM-dies trying to build a
// program for them. They are linted at their INJECTED destination, never at this path.
const isInjectionPayload = (p) => p.includes('/skill-evals/features/')

export default {
	'**/*.(css|graphql|js|jsx|json|jsonc|scss|ts|tsx)': (files) => {
		const f = files.filter((p) => !isGenerated(p) && !isInjectionPayload(p))
		// --no-errors-on-unmatched: when the only staged matches are biome-ignored
		// (e.g. a generated public/openapi.json), biome would otherwise exit non-zero.
		return f.length ? [`bun x biome check --diagnostic-level=error --write --unsafe --no-errors-on-unmatched ${f.join(' ')}`] : []
	},
	'**/*.(js|jsx|ts|tsx)': (files) => {
		const f = files.filter((p) => !isGenerated(p) && !isInjectionPayload(p))
		return f.length ? [`bun x eslint --quiet --fix ${f.join(' ')}`] : []
	},
	// Detector self-tests: the classify-edit engine, the batch detectors, and the registries'
	// detect: regexes ARE detector behavior — any change to them must keep the suites green
	// (includes the regex-compile audit that catches typo'd detect patterns).
	'{.claude/hooks/**/*.ts,.claude/registry.yaml,.claude/skills/**/registry.yaml,scripts/detectors/**/*.ts}': () => 'bun test ./.claude/hooks ./scripts/detectors',
}
