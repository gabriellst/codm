/**
 * Generates `packages/api/typescript/public/docs/openapi.json` without booting the
 * full HTTP server. Sets EMIT_OPENAPI=true so openapi.generateSpecification()
 * writes the file, then exits.
 *
 * ref: dev:packages/api/src/shared/index.ts (openapi.generateSpecification pattern)
 */
process.env.EMIT_OPENAPI = 'true'
process.env.START_SERVER = 'false'

// reflect-metadata must be first
import 'reflect-metadata'

import { openapi } from '@template/core-typescript'

// Composition root — importing it triggers every context's BoundedContext.create (builds routers,
// wires handlers), starting with @shared/index (creates the root BoundedContext + applies
// registries). Single source of the router list, checked against the manifest — no parallel array.
import { ALL_ROUTERS } from '../src/routers'

await openapi.generateSpecification(ALL_ROUTERS)

console.log('✅ openapi.json emitted to public/docs/openapi.json')
process.exit(0)
