import { injectable } from 'tsyringe-neo'
import { Controller, z } from '@codm/core-typescript'
import { PanelWebBundle } from '../services/PanelWebBundle'

/** A built file's name — the hashed names the panel build writes (`index-3f2a1c.js`). No separator, ever. */
export const PanelAssetInputSchema = z.object({
	params: z.object({
		file: z
			.string()
			.min(1)
			.max(200)
			.regex(/^[A-Za-z0-9._-]+$/),
	}),
})
export const PanelAssetOutputSchema = z.string().example(['/* asset */'])

/**
 * PUBLIC — one file of the panel bundle (its script, its styles), by the exact name the build gave it. The name
 * is LOOKED UP in the set read at boot; any other value — a traversal attempt included — answers 404 without
 * touching the disk. Names carry a content hash, so a file never changes: cached for a year.
 */
@injectable()
export class PanelAssetController extends Controller<typeof PanelAssetInputSchema, typeof PanelAssetOutputSchema> {
	readonly path = '/panel/assets/:file'
	readonly method = 'get' as const
	readonly description = 'A file of the panel app bundle, by its hashed name (public)'
	readonly inputSchema = PanelAssetInputSchema
	readonly outputSchema = PanelAssetOutputSchema

	constructor(private readonly bundle: PanelWebBundle) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const asset = this.bundle.asset(request.params.file)
		if (!asset) return this.rawResponse(new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }))
		return this.rawResponse(
			new Response(asset.body, {
				headers: {
					'Content-Type': asset.contentType,
					'Cache-Control': 'public, max-age=31536000, immutable',
					'X-Content-Type-Options': 'nosniff',
				},
			}),
		)
	}
}
