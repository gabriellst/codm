import { registerMcpScopes } from '@codedm/core-typescript'
import { MCP_SCOPE_BY_OPERATION } from './manifest'

/**
 * Publish the manifest to the core-side registry the OpenAPI emitter reads.
 *
 * A SIDE-EFFECT MODULE, imported from `agent/registry.ts`, exactly like `import './errors'` right
 * above it — and for the same structural reason. The emitter lives in `core`, the declaration lives
 * here, and `core` must not import from `src`; so the api REGISTERS at module load and the emitter
 * READS. `x-error-codes` has worked this way since before this phase existed, which is why this seam
 * is a copy rather than an invention.
 *
 * The ordering guarantee is the composition root's: `src/index.ts` imports every context router
 * (which pulls each `registry.ts`, which pulls this) BEFORE calling `generateSpecification()`. An
 * operation whose scope had not been registered by then would silently emit without `x-mcp-scope` and
 * without its `mcp:` tag — and the generator's count assertion is what turns that into a thrown build
 * rather than an empty tool surface nobody notices.
 */
registerMcpScopes(MCP_SCOPE_BY_OPERATION)
