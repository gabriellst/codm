import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scheduledCommands } from '@codm/contracts/db'
import { TestBed, givenThread, givenArtifact } from '@test/support'
import { BaseError, LibSqlDatabaseDriver } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { SendArtifact } from './SendArtifact'
import { ChannelSender, MockChannelSender, type ChannelCapabilities } from '@thread/services/ChannelSender'
import { MediaStore, MockMediaStore } from '../services/MediaStore'

/**
 * "envio de artefatos pelo canal" design — decision 6: every refusal is a USE-CASE-TIME throw, before
 * anything is enqueued. This suite proves each one, plus the two enqueue shapes (LINK → text,
 * everything else → the staged-media command) — reading the durable row `shared_scheduled_commands`
 * the same way `DeliverChannelMessage.test.ts` does, since `SendArtifact` never calls the delivery
 * handler directly (B3, decision 2: enqueue is the whole job of this use case).
 */
describe('SendArtifact', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'send-artifact-'))
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	function writeFile(name: string, bytes: string): string {
		const path = join(scratch, `${crypto.randomUUID()}-${name}`)
		writeFileSync(path, bytes)
		return path
	}

	/** A sparse file of `size` bytes — no real I/O cost, enough to trip the size ceiling. */
	function writeOversizedFile(name: string, size: number): string {
		const path = join(scratch, `${crypto.randomUUID()}-${name}`)
		writeFileSync(path, '')
		truncateSync(path, size)
		return path
	}

	const enqueuedCommands = async () => {
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		return db.select().from(scheduledCommands)
	}

	it('IMAGE — stages the file and enqueues deliver_channel_attachment with the staged mediaPath', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeFile('shot.png', 'PNGBYTES')
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.IMAGE, ref: path })
		testBed.override(ChannelSender, new MockChannelSender())
		const mediaStore = new MockMediaStore()
		testBed.override(MediaStore, mediaStore)

		await testBed.resolve(SendArtifact).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			artifactId: artifact.id.value,
			caption: 'olha só',
		})

		expect(mediaStore.staged).toEqual([path])
		const rows = await enqueuedCommands()
		expect(rows).toHaveLength(1)
		expect(rows[0]?.name).toBe('deliver_channel_attachment')
		expect(rows[0]?.input).toMatchObject({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			artifactId: artifact.id.value,
			kind: ArtifactKind.IMAGE,
			caption: 'olha só',
		})
	})

	it('FILE — enqueues with fileName (basename of ref) and mimeType by extension', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeFile('report.pdf', 'PDFBYTES')
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.FILE, ref: path })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await testBed.resolve(SendArtifact).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })

		const rows = await enqueuedCommands()
		expect(rows[0]?.input).toMatchObject({ kind: ArtifactKind.FILE, fileName: path.split('/').at(-1), mimeType: 'application/pdf' })
	})

	it('LINK — enqueues deliver_channel_message with caption + url, never touching MediaStore/sendMedia', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.LINK, ref: 'https://preview.example.com' })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)
		const mediaStore = new MockMediaStore()
		testBed.override(MediaStore, mediaStore)

		await testBed.resolve(SendArtifact).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			artifactId: artifact.id.value,
			caption: 'preview do PR',
		})

		expect(mediaStore.staged).toHaveLength(0)
		expect(sender.sentMedia).toHaveLength(0)
		const rows = await enqueuedCommands()
		expect(rows).toHaveLength(1)
		expect(rows[0]?.name).toBe('deliver_channel_message')
		expect(rows[0]?.input).toMatchObject({
			channelId: thread.channelId,
			contactExternalId: thread.contactRef.externalId,
			text: 'preview do PR\nhttps://preview.example.com',
			author: 'SYSTEM',
		})
	})

	it('LINK without a caption — the text is just the url', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.LINK, ref: 'https://preview.example.com' })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await testBed.resolve(SendArtifact).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })

		const rows = await enqueuedCommands()
		expect(rows[0]?.input).toMatchObject({ text: 'https://preview.example.com' })
	})

	it('ARTIFACT_NOT_FOUND — unknown artifact id', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await expect(
			testBed.resolve(SendArtifact).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				artifactId: '00000000-0000-4000-8000-0000000000ee',
			}),
		).rejects.toThrow(BaseError)
	})

	it("ARTIFACT_NOT_FOUND — an artifact that belongs to another thread than the one named", async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const otherThread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const artifact = await givenArtifact(testBed, otherThread.id.value, { ref: writeFile('x.png', 'x') })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await expect(
			testBed.resolve(SendArtifact).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value }),
		).rejects.toThrow(BaseError)
	})

	it('ARTIFACT_FILE_MISSING — ref no longer names a file on disk', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const artifact = await givenArtifact(testBed, thread.id.value, {
			kind: ArtifactKind.IMAGE,
			ref: join(scratch, 'never-written.png'),
		})
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		const promise = testBed
			.resolve(SendArtifact)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })
		await expect(promise).rejects.toThrow(BaseError)
		await expect(promise).rejects.toMatchObject({ name: 'ARTIFACT_FILE_MISSING' })
		expect(await enqueuedCommands()).toHaveLength(0)
	})

	it('ARTIFACT_TOO_LARGE — over the kind ceiling, refused BEFORE staging or enqueueing', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeOversizedFile('huge.png', 16 * 1024 * 1024 + 1)
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.IMAGE, ref: path })
		testBed.override(ChannelSender, new MockChannelSender())
		const mediaStore = new MockMediaStore()
		testBed.override(MediaStore, mediaStore)

		const promise = testBed
			.resolve(SendArtifact)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })
		await expect(promise).rejects.toMatchObject({ name: 'ARTIFACT_TOO_LARGE' })
		expect(mediaStore.staged).toHaveLength(0)
		expect(await enqueuedCommands()).toHaveLength(0)
	})

	it('a FILE artifact gets the larger 64 MiB ceiling — one byte over IMAGE\'s 16 MiB still sends fine', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeOversizedFile('big.pdf', 16 * 1024 * 1024 + 1)
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.FILE, ref: path })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await testBed.resolve(SendArtifact).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })

		expect(await enqueuedCommands()).toHaveLength(1)
	})

	it('CHANNEL_MEDIA_UNSUPPORTED — the bound channel cannot deliver media, refused before staging', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeFile('shot.png', 'PNGBYTES')
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.IMAGE, ref: path })
		const sender = new MockChannelSender()
		sender.capabilities = { edit: true, media: false } satisfies ChannelCapabilities
		testBed.override(ChannelSender, sender)
		const mediaStore = new MockMediaStore()
		testBed.override(MediaStore, mediaStore)

		const promise = testBed
			.resolve(SendArtifact)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })
		await expect(promise).rejects.toMatchObject({ name: 'CHANNEL_MEDIA_UNSUPPORTED' })
		expect(mediaStore.staged).toHaveLength(0)
		expect(await enqueuedCommands()).toHaveLength(0)
	})

	it('AUDIO / VIDEO — same media path as IMAGE, no fileName/mimeType (those are FILE-only)', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = writeFile('clip.mp4', 'VIDEOBYTES')
		const artifact = await givenArtifact(testBed, thread.id.value, { kind: ArtifactKind.VIDEO, ref: path })
		testBed.override(ChannelSender, new MockChannelSender())
		testBed.override(MediaStore, new MockMediaStore())

		await testBed.resolve(SendArtifact).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, artifactId: artifact.id.value })

		const rows = await enqueuedCommands()
		const input = rows[0]?.input as Record<string, unknown>
		expect(input.kind).toBe(ArtifactKind.VIDEO)
		expect(input.fileName).toBeUndefined()
		expect(input.mimeType).toBeUndefined()
	})
})
