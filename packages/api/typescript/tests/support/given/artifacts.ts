// Artifact given helper — sets up an Artifact via the repository directly (never RecordArtifact).
import type { TestBedLike } from './types'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { Artifact } from '@artifact/entities/Artifact'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'

type ArtifactOverrides = Partial<{
	ownerId: string
	issueId: string
	kind: ArtifactKind
	name: string
	ref: string
	meta: string
}>

/** Nested on `givenThread` the same way `givenAppointment` nests on `givenClinicWithOwner` — the
 *  caller passes the `threadId` a `givenThread` call already produced. */
export async function givenArtifact(testBed: TestBedLike, threadId: string, overrides: ArtifactOverrides = {}): Promise<Artifact> {
	const repo = testBed.resolve(ArtifactRepository)
	const artifact = Artifact.create({
		ownerId: overrides.ownerId ?? testBed.ownerId,
		threadId,
		issueId: overrides.issueId,
		kind: overrides.kind ?? ArtifactKind.IMAGE,
		name: overrides.name ?? 'artifact.png',
		ref: overrides.ref ?? '/tmp/artifact.png',
		meta: overrides.meta ?? '',
	})
	await repo.save(artifact)
	return artifact
}
