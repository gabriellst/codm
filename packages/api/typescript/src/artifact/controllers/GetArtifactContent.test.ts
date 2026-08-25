import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { TestBed, givenThread } from '@test/support'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RecordArtifact } from '../usecases/RecordArtifact'
import { GetArtifactContentController, parseRange } from './GetArtifactContent'

/** Ten bytes with distinguishable content, so a byte window can be asserted by VALUE, not by length. */
const BODY = '0123456789'

describe('GetArtifactContentController', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const scratch = mkdtempSync(join(tmpdir(), 'artifact-content-ctrl-'))

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	const requestFor = (threadId: string, artifactId: string, range?: string): HttpControllerRequest<unknown> =>
		({
			headers: range ? { range } : {},
			params: { threadId, artifactId },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		}) as unknown as HttpControllerRequest<unknown>

	async function givenImageArtifact(fileName = 'shot.png') {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const path = join(scratch, `${crypto.randomUUID()}-${fileName}`)
		writeFileSync(path, BODY)
		const { artifactId } = await testBed.resolve(RecordArtifact).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			kind: ArtifactKind.IMAGE,
			name: fileName,
			ref: path,
			meta: '',
		})
		return { artifactId, threadId: thread.id.value }
	}

	/** `execute` returns the raw `Response` here — `rawResponse` is how a streaming controller answers. */
	const send = async (request: HttpControllerRequest<unknown>): Promise<Response> =>
		(await testBed.resolve(GetArtifactContentController).execute(request)) as unknown as Response

	it('serves the whole file inline, typed by the extension', async () => {
		const { artifactId, threadId } = await givenImageArtifact('shot.png')

		const response = await send(requestFor(threadId, artifactId))

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('image/png')
		expect(response.headers.get('Content-Disposition')).toStartWith('inline;')
		expect(response.headers.get('Accept-Ranges')).toBe('bytes')
		expect(response.headers.get('Content-Length')).toBe(String(BODY.length))
		expect(await response.text()).toBe(BODY)
	})

	/**
	 * The half that makes `<video>` seekable. A server that ignores `Range` and answers 200 leaves the
	 * element with the whole file and no way to jump into it.
	 */
	it('answers a byte window with 206 and exactly those bytes', async () => {
		const { artifactId, threadId } = await givenImageArtifact('clip.mp4')

		const response = await send(requestFor(threadId, artifactId, 'bytes=2-5'))

		expect(response.status).toBe(206)
		expect(response.headers.get('Content-Range')).toBe(`bytes 2-5/${BODY.length}`)
		expect(response.headers.get('Content-Length')).toBe('4')
		expect(await response.text()).toBe('2345')
	})

	it('answers an open-ended window from the offset to the last byte', async () => {
		const { artifactId, threadId } = await givenImageArtifact()

		const response = await send(requestFor(threadId, artifactId, 'bytes=7-'))

		expect(response.status).toBe(206)
		expect(response.headers.get('Content-Range')).toBe(`bytes 7-9/${BODY.length}`)
		expect(await response.text()).toBe('789')
	})

	it('answers 416 for a window that starts past the end, and says how big the file is', async () => {
		const { artifactId, threadId } = await givenImageArtifact()

		const response = await send(requestFor(threadId, artifactId, 'bytes=99-120'))

		expect(response.status).toBe(416)
		expect(response.headers.get('Content-Range')).toBe(`bytes */${BODY.length}`)
	})

	/**
	 * THE ROUND TRIP THE ROUTER ACTUALLY PERFORMS.
	 *
	 * `handle()` builds the body with `Readable.toWeb(createReadStream(...))`, and `FastifyHttpRouter.
	 * sendWebResponse` converts it straight back with `Readable.fromWeb(response.body)` before handing
	 * it to `reply.send`. Every other assertion here reads the body with `response.text()`, which
	 * exercises the web stream but NOT that conversion — and the conversion is the one step this
	 * endpoint does not share with the SSE controllers (they construct a `ReadableStream` directly and
	 * never round-trip a node stream). So this replays it verbatim.
	 */
	it('survives the node↔web stream conversion the router performs', async () => {
		const { artifactId, threadId } = await givenImageArtifact()
		const response = await send(requestFor(threadId, artifactId))

		const nodeStream = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0])
		const chunks: Buffer[] = []
		for await (const chunk of nodeStream) chunks.push(Buffer.from(chunk as Uint8Array))

		expect(Buffer.concat(chunks).toString()).toBe(BODY)
	})

	it('is not exposed as an MCP tool', () => {
		expect(GetArtifactContentController.mcpScopes).toBeUndefined()
	})
})

describe('parseRange', () => {
	it.each([
		['bytes=0-4', { start: 0, end: 4 }],
		['bytes=2-', { start: 2, end: 9 }],
		['bytes=-3', { start: 7, end: 9 }],
		// Past the end on the CLOSING side is clamped, not refused: the client asked for "the rest".
		['bytes=8-99', { start: 8, end: 9 }],
	])('reads %s', (header, expected) => {
		expect(parseRange(header, 10)).toEqual(expected)
	})

	it.each([['bytes=10-12'], ['bytes=5-2'], ['bytes=-0']])('refuses %s as unsatisfiable', header => {
		expect(parseRange(header, 10)).toBe('unsatisfiable')
	})

	/** No range asked, or a form this server does not speak — both mean "send the whole thing". */
	it.each([[undefined], ['bytes=-'], ['items=0-4'], ['bytes=0-1, 4-6'], ['garbage']])('treats %s as no range', header => {
		expect(parseRange(header, 10)).toBeUndefined()
	})
})
