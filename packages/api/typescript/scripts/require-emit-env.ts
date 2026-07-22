/**
 * Side-effecting guard imported FIRST by scripts/emit-openapi.ts.
 *
 * Why a separate module and not a top-of-file statement: under ESM, every `import` is hoisted and
 * evaluated (depth-first, source order) BEFORE any statement in the importer's body. So a bare
 * `process.env.EMIT_OPENAPI = 'true'` in emit-openapi.ts runs too late — the composition root
 * (`@template/core-typescript` → `../src/routers` → `@shared/index`'s top-level-await
 * BoundedContext.create) has already evaluated with EMIT_OPENAPI still undefined, booting the REAL
 * embedded PGlite (mkdir + migrate ~/.codedm/data + start the outbox dispatcher). This module has no
 * dependency on the composition root, so importing it before core/routers makes its assertion the
 * first thing that runs — failing loud instead of silently booting the real DB.
 *
 * EMIT_OPENAPI is set in the environment by the nx target (`EMIT_OPENAPI=true … bun run
 * scripts/emit-openapi.ts`, project.json). Direct invocation without it is the footgun this guards.
 */
if (process.env.EMIT_OPENAPI !== 'true') {
	throw new Error(
		'emit-openapi must run with EMIT_OPENAPI=true in the ENVIRONMENT (not assigned in-script — ESM ' +
			'evaluates the composition-root import before the script body, so an in-body assignment is too ' +
			'late and the real embedded PGlite boots instead). Run via `bun run emit-openapi` / `bun sdk`, ' +
			'or prefix the env yourself: `EMIT_OPENAPI=true bun run scripts/emit-openapi.ts`.',
	)
}
