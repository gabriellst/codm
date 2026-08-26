// scripts/lib/context-layers.ts — WHICH LAYERS OF A BOUNDED CONTEXT HAVE A BARREL, declared.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ WHY THIS EXISTS                                                                              │
// │                                                                                              │
// │ Until 2026-08-14 the answer was "some do". Measured across `packages/api/typescript/src`:    │
// │ 116 layer folders, 99 with a barrel somebody imported and 17 with one nobody did, 648        │
// │ imports through a barrel against 1319 straight to the module — and the SAME folder often     │
// │ both ways (`agent/types`: 29 through, 39 around). The 17 dead ones were not a category, they │
// │ were the folders that happened to land on zero. Nothing was wrong with any single import;    │
// │ what was missing was a rule about which door exists.                                         │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// THE LINE IS DERIVED, NOT TASTED. Three of the five `allowed` layers are structural in at least one context — their
// barrel is not an alternative door, it is the ONLY door, because a registrar consumes the folder
// as an OBJECT and a namespace import needs an `index.ts`:
//
//   controllers  →  all 10 `<ctx>/index.ts` do `import * as controllers from './controllers'`
//                   and hand the object to `BoundedContext.create({ controllers })`
//   enums        →  `shared/index.ts`: `import * as authEnums from '@auth/enums'` …
//                   → `openapi.registerEnums({ ...wireEnums, ...sharedEnums, ...authEnums, ... })`
//   objects      →  `shared/index.ts`: `import * as sharedObjects from './objects'`
//                   → `openapi.registerSchemas({ ...sharedObjects })`
//
// STRUCTURAL IS PER FOLDER, NOT PER LAYER — which is why the policy is `allowed` and not
// `required`. `controllers` is namespace-imported in all 10 contexts, but only `shared/objects` and
// only three of the four `enums` folders are. Declaring the layer "required" would have forced a
// door into `auth/objects` that no registrar reads and nobody imports — and the first run caught
// exactly that: `auth/objects/index.ts` was reported dead by `barrel-liveness` while this table
// insisted it must exist. The table says where a door is LEGITIMATE; `tsc` enforces the ones a
// namespace import actually needs, and `barrel-liveness` kills the ones nobody reaches.
//
// The other two are settled convention rather than construction, and the measurement says so
// plainly: `middlewares` 61 imports through the barrel against 3 around it, `schemas` 29 against 8.
// Everything else is a CATALOGUE — modules cited one at a time — and the repo had already voted:
// `usecases` 5 through / 240 around, `entities` 6 / 100, `services` 16 / 240, `repositories`
// 40 / 238. The rule ratifies the majority the code already chose, layer by layer, and then locks
// it so it stops drifting. It does NOT dictate import direction: in an `allowed` layer the barrel
// is alive either way, so `@auth/middlewares` and `@auth/middlewares/OperatorMiddleware` are both
// fine. The only thing gated is whether the door EXISTS.
//
// WHAT `forbidden` MEANS, precisely: no PURE BARREL (an `index.ts` whose every statement is a
// re-export). An `index.ts` that declares something of its own is a module that happens to be
// named `index`, and this table has no opinion about it — which is exactly the `errors` case: all
// 9 of them declare the `DomainErrors`/`ApplicationErrors` unions and call `registerErrorCodes`,
// so they are modules, not doors, and they stay. That is also why `errors` reads 60:1 through the
// "barrel": there was never a deep alternative to read.
//
// Enforced by `scripts/context-barrels.test.ts` (which also fails when a layer appears on disk
// without an entry here) and consumed by `scripts/cli/wire.ts`, so the scaffolder cannot recreate
// a door the rule forbids.

/** Whether a layer of a bounded context has a barrel (`<ctx>/<layer>/index.ts`). */
export type BarrelPolicy =
	/**
	 * A barrel MAY exist here. In the folders a registrar namespace-imports it MUST, and `tsc` is
	 * what says so — `import * as controllers from './controllers'` stops resolving the moment the
	 * index is gone, which is a better error than anything this table could raise. Where no registrar
	 * consumes it, `barrel-liveness` still asks the reachability question: an allowed barrel nobody
	 * imports is dead like any other.
	 */
	| 'allowed'
	/** No pure re-export `index.ts`. A content module named `index.ts` is untouched. */
	| 'forbidden'

export interface LayerDecl {
	barrel: BarrelPolicy
	/** Why. For `allowed`, the mechanism or the measurement; for `forbidden`, the measured vote. */
	why: string
}

/**
 * Exhaustive over the layer folders `packages/api/typescript/src/<ctx>/<layer>/` contains. A layer
 * that appears on disk without an entry here fails the gate — a new layer is a decision, never a
 * default.
 */
export const CONTEXT_LAYERS: Record<string, LayerDecl> = {
	// ── allowed: the barrel is the door ───────────────────────────────────────
	controllers: {
		barrel: 'allowed',
		why: 'STRUCTURAL — every `<ctx>/index.ts` does `import * as controllers from ./controllers` and passes the namespace object to BoundedContext.create({ controllers }). Deleting the index would unmount the context.',
	},
	enums: {
		barrel: 'allowed',
		why: 'STRUCTURAL — shared/index.ts namespace-imports each context enum barrel into openapi.registerEnums(...), which is what makes OpenAPI name them by context (PlanName, not Status2).',
	},
	objects: {
		barrel: 'allowed',
		why: 'STRUCTURAL — shared/index.ts namespace-imports it into openapi.registerSchemas(...). The register is a spread of the whole folder, so the folder needs an object to be.',
	},
	middlewares: {
		barrel: 'allowed',
		why: 'CONVENTION, settled: 61 imports through the barrel against 3 around it. Controllers name a middleware from another context (@auth/middlewares) far more often than from their own.',
	},
	schemas: {
		barrel: 'allowed',
		why: 'CONVENTION, settled: 29 imports through the barrel against 8 around it.',
	},

	// ── forbidden: a catalogue, cited one module at a time ─────────────────────
	usecases: { barrel: 'forbidden', why: 'CATALOGUE — 5 imports through the barrel against 240 straight to the module.' },
	entities: { barrel: 'forbidden', why: 'CATALOGUE — 6 through against 100 around.' },
	repositories: { barrel: 'forbidden', why: 'CATALOGUE — 40 through against 238 around.' },
	services: { barrel: 'forbidden', why: 'CATALOGUE — 16 through against 240 around.' },
	events: {
		barrel: 'forbidden',
		why: 'CATALOGUE — 34 through against 62 around. A handler cites ONE event by name; nothing consumes the folder whole.',
	},
	types: { barrel: 'forbidden', why: 'CATALOGUE — 29 through against 39 around.' },
	agents: { barrel: 'forbidden', why: 'CATALOGUE — 2 through against 26 around.' },
	utils: {
		barrel: 'forbidden',
		why: 'CATALOGUE — 7 through against 6 around, on 13 imports total. Too thin to be a convention, and a `utils` barrel is the classic place a dead one hides.',
	},
	i18n: { barrel: 'forbidden', why: 'CATALOGUE — 3 through against 4 around.' },
	config: { barrel: 'forbidden', why: 'CATALOGUE — 2 through against 1 around, on 3 imports total.' },
	handlers: {
		barrel: 'forbidden',
		why: 'Already true on disk, and deliberately: the mount points are the NAMED barrels `handlers/internal.ts` and `handlers/external.ts`, namespace-imported by `<ctx>/index.ts`. There is no `handlers/index.ts` in any of the 8 contexts and there must not be one.',
	},
	projections: {
		barrel: 'forbidden',
		why: 'NO INSTANCE IN THIS TREE YET — no context has a projections/ folder, so there is no vote to ratify, and this entry says so rather than pretending to a measurement. Classified by the same principle as its siblings: a projector cites ONE projection by name. The structural mount of that layer is `projections/projectors/index.ts` (BoundedContextOptions.projectors is a namespace object, like controllers), and THAT is not a layer barrel — it is one level deeper, so this policy never touches it.',
	},
	mcp: { barrel: 'forbidden', why: 'CATALOGUE — 25 imports, none through a barrel; the folder has no index.ts today.' },
	testing: {
		barrel: 'forbidden',
		why: 'CATALOGUE — the test-support seam is reached by its own subpath (`@codm/api-typescript/testing`), not by a folder barrel.',
	},
	db: { barrel: 'forbidden', why: 'CATALOGUE — one module, one importer.' },
	errors: {
		barrel: 'forbidden',
		why: 'No pure barrel here — and none of the 9 is one. Each `errors/index.ts` DECLARES the DomainErrors/ApplicationErrors/InterfaceErrors/InfrastructureErrors unions and calls registerErrorCodes, so it is a module named `index`, which this table does not govern. Turning it into a re-export door would move the unions somewhere they do not belong.',
	},
}

/** Layers where a barrel may exist. */
export const barrelLayers = (): string[] =>
	Object.entries(CONTEXT_LAYERS)
		.filter(([, decl]) => decl.barrel === 'allowed')
		.map(([layer]) => layer)
		.sort()

/**
 * True when a barrel may exist in `<ctx>/<layer>/`. An UNKNOWN layer answers false, which is the
 * safe direction for the scaffolder — it declines to create a door for a layer nobody classified,
 * and `context-barrels` fails on the missing declaration in the same change.
 */
export const barrelAllowedIn = (layer: string): boolean => CONTEXT_LAYERS[layer]?.barrel === 'allowed'
