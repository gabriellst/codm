/**
 * Generates `packages/api/typescript/public/docs/openapi.json` without booting the
 * full HTTP server. Requires EMIT_OPENAPI=true IN THE ENVIRONMENT (set by the nx `emit-openapi`
 * target / `bun sdk`) so openapi.generateSpecification() writes the file, then exits.
 *
 * The guard MUST be set in the env, not assigned here: ESM evaluates the composition-root import
 * (`@codm/core-typescript` → `../src/routers`) before this module's body, so an in-body
 * `process.env.EMIT_OPENAPI = 'true'` runs too late and the real embedded database would boot (mkdir +
 * migrate the real data dir + start the outbox dispatcher). `./require-emit-env` (imported first, no
 * composition-root dependency) asserts the env is set and fails loud on direct invocation without it.
 *
 * ref: dev:packages/api/src/shared/index.ts (openapi.generateSpecification pattern)
 */

// MUST be first — asserts EMIT_OPENAPI is already set in the env before the composition root loads.
import './require-emit-env'

// reflect-metadata must be evaluated before the composition root (decorator metadata).
import 'reflect-metadata'

import { openapi } from '@codm/core-typescript'

// Composition root — importing it triggers every context's BoundedContext.create (builds routers,
// wires handlers), starting with @shared/index (creates the root BoundedContext + applies
// registries). Single source of the router list, checked against the manifest — no parallel array.
import { ALL_ROUTERS } from '../src/routers'

await openapi.generateSpecification(ALL_ROUTERS)

console.log('✅ openapi.json emitted to public/docs/openapi.json')
process.exit(0)
