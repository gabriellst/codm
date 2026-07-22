import { AggregateRoot, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'

export const ArtifactSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid().optional(),
	kind: z.enum(ArtifactKind),
	name: z.string().trim().min(1),
	// Local path (IMAGE/FILE) or URL (LINK).
	ref: z.string().trim().min(1),
	meta: z.string(),
	recordedAt: z.date(),
})

export type ArtifactProps = Z.infer<typeof ArtifactSchema>

/** `Artifact` (BC6 Artifact Registry, Support) — a non-code output produced by an agent (image /
 *  file / link / preview deploy), catalogued per thread (optionally per issue). */
export class Artifact extends AggregateRoot<typeof ArtifactSchema> {
	static override schema = ArtifactSchema

	static create(data: { ownerId: string; threadId: string; issueId?: string; kind: ArtifactKind; name: string; ref: string; meta: string }): Artifact {
		return new Artifact({
			ownerId: data.ownerId,
			threadId: data.threadId,
			issueId: data.issueId,
			kind: data.kind,
			name: data.name,
			ref: data.ref,
			meta: data.meta,
			recordedAt: new Date(),
		})
	}
}

export interface Artifact extends ArtifactProps {}
