import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'

/** Context-private fact: a non-code output was catalogued. Bridged to the frozen
 *  `integration.artifact.recorded` (BC6 → dashboard SSE / artifacts tab). */
export const ArtifactRecordedEventSchema = z.domainEvent({
	artifactId: z.string(),
	threadId: z.string(),
	issueId: z.string().optional(),
	kind: z.enum(ArtifactKind),
	name: z.string(),
})

export class ArtifactRecordedEvent extends BaseDomainEvent<typeof ArtifactRecordedEventSchema> {
	static override readonly name = 'artifact.recorded' as const
	static readonly schema = ArtifactRecordedEventSchema
}
