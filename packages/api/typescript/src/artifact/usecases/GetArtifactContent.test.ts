import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestBed, givenThread } from '@test/support'
import { BaseError } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RecordArtifact } from './RecordArtifact'
import { GetArtifactContent } from './GetArtifactContent'

const OTHER_OWNER = '00000000-0000-4000-8000-0000000000aa'

describe('GetArtifactContent', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'artifact-content-'))
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	/** Record an artifact whose ref is a real file in the scratch dir, and hand back its id. */
	async function givenFileArtifact(options?: { ownerId?: string; kind?: ArtifactKind; fileName?: string; bytes?: string }) {
		const ownerId = options?.ownerId ?? MOCK_CLOUD_OWNER_ID
		const thread = await givenThread(testBed, { ownerId })
		const fileName = options?.fileName ?? 'shot.png'
		const path = join(scratch, `${crypto.randomUUID()}-${fileName}`)
		writeFileSync(path, options?.bytes ?? 'PNGBYTES')
		const { artifactId } = await testBed.resolve(RecordArtifact).execute({
			ownerId,
			threadId: thread.id.value,
			kind: options?.kind ?? ArtifactKind.IMAGE,
			name: fileName,
			ref: path,
			meta: '',
		})
		return { artifactId, threadId: thread.id.value, path, ownerId }
	}

	it('resolves the file behind an artifact, with the media type of its extension', async () => {
		const { artifactId, threadId } = await givenFileArtifact({ fileName: 'shot.png', bytes: 'PNGBYTES' })

		const out = await testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, artifactId })

		expect(out.contentType).toBe('image/png')
		expect(out.fileName).toEndWith('shot.png')
		expect(out.size).toBe('PNGBYTES'.length)
	})

	it.each([
		['video/mp4', 'clip.mp4'],
		['audio/mp4', 'note.m4a'],
	])('declares %s for %s', async (contentType, fileName) => {
		const kind = fileName.endsWith('.mp4') ? ArtifactKind.VIDEO : ArtifactKind.AUDIO
		const { artifactId, threadId } = await givenFileArtifact({ kind, fileName })

		const out = await testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, artifactId })

		expect(out.contentType).toBe(contentType)
	})

	it('rejects an artifact id that does not exist', async () => {
		const { threadId } = await givenFileArtifact()
		await expect(
			testBed
				.resolve(GetArtifactContent)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, artifactId: '00000000-0000-4000-8000-0000000000ee' }),
		).rejects.toThrow(BaseError)
	})

	it("rejects another owner's artifact", async () => {
		const { artifactId, threadId } = await givenFileArtifact({ ownerId: OTHER_OWNER })
		await expect(testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, artifactId })).rejects.toThrow(
			BaseError,
		)
	})

	/**
	 * The path names a thread and the row names a thread, and they have to be the same one. Without
	 * this the `threadId` in the URL would be decoration and any artifact id would resolve under any
	 * thread of the same owner.
	 */
	it('rejects an artifact whose thread is not the one in the path', async () => {
		const { artifactId } = await givenFileArtifact()
		const otherThread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await expect(
			testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: otherThread.id.value, artifactId }),
		).rejects.toThrow(BaseError)
	})

	it('rejects an artifact whose file is gone from disk', async () => {
		const { artifactId, threadId, path } = await givenFileArtifact()
		rmSync(path)

		await expect(testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, artifactId })).rejects.toThrow(
			BaseError,
		)
	})

	it('rejects a LINK artifact — there are no local bytes and the daemon does not fetch the URL', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { artifactId } = await testBed.resolve(RecordArtifact).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			kind: ArtifactKind.LINK,
			name: 'preview',
			ref: 'https://acme-pr-214.vercel.app',
			meta: '',
		})

		await expect(
			testBed.resolve(GetArtifactContent).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId }),
		).rejects.toThrow(BaseError)
	})
})
