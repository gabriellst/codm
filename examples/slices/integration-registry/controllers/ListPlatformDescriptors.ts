// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/controllers/ListPlatformDescriptors.ts

import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { type PlatformDescription, PlatformRegistrySchema } from '@integration/services'

export const ListPlatformDescriptorsControllerInputSchema = z.object({})

// Output IS the registry union itself, so the generated SDK/OpenAPI carries the
// full `connectionMode → type → platform` discriminated union. The frontend
// renders per-platform connect forms straight off this static type — it never
// actually calls the route, so the runtime body (below) may diverge.
export const ListPlatformDescriptorsControllerOutputSchema = PlatformRegistrySchema

/**
 * `GET /integrations/platforms` — type carrier for the `PlatformRegistrySchema`
 * discriminated union. Its only job is to push that union into the generated
 * SDK/OpenAPI types so the frontend can render per-platform connect forms off
 * the static `PlatformDescription` type. The runtime body is the registry
 * serialized as a JSON Schema document (still useful for a runtime form
 * renderer); the Controller base does not validate output, so the body may
 * diverge from the declared union type. Public read; descriptors are
 * configuration shape, not secrets.
 */
@injectable()
export class ListPlatformDescriptorsController extends Controller<
	typeof ListPlatformDescriptorsControllerInputSchema,
	typeof ListPlatformDescriptorsControllerOutputSchema
> {
	readonly path = '/integrations/platforms'
	readonly method = 'get' as const
	readonly description = 'Read the platform-descriptor registry (per-platform authMode, scopes, input/output token schemas)'
	readonly inputSchema = ListPlatformDescriptorsControllerInputSchema
	readonly outputSchema = ListPlatformDescriptorsControllerOutputSchema

	async handle(): Promise<this['output']> {
		// Runtime body is the JSON-Schema serialization of the registry; the
		// declared output type is the union itself (see file header). Output is
		// not runtime-validated, so the deliberate divergence is type-erased
		// behind this cast.
		return { status: HttpStatusCode.OK, data: z.toJSONSchema(PlatformRegistrySchema) as unknown as PlatformDescription }
	}
}
