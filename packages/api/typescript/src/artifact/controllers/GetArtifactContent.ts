import { injectable } from 'tsyringe-neo'
import { createReadStream } from 'node:fs'
import { Controller, HttpStatusCode, MimeTypes, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetArtifactContent, GetArtifactContentInputSchema } from '../usecases/GetArtifactContent'

export const GetArtifactContentControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: GetArtifactContentInputSchema.pick({ threadId: true, artifactId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', artifactId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
		},
	])

/**
 * The LOGICAL payload is the file's bytes, which Zod cannot describe — same posture as
 * `StreamTerminalSession`, whose schema describes frames and not the SSE framing around them. The
 * SDK's only job for this operation is to hand the console the URL (via the generated query key);
 * nothing calls the generated hook.
 */
export const GetArtifactContentControllerOutputSchema = z.string().example(['<binary>'])

/**
 * The bytes of one artifact, addressed by id, for the browser.
 *
 * ### Why an endpoint at all
 * `ref` is a path on the operator's own disk, and neither half of the console can read it: a browser
 * cannot open `file://` from an http page, and the Tauri webview would need the `asset:` protocol,
 * which only exists in the desktop half. One HTTP origin serves both, so there is ONE rendering path
 * to keep working instead of two.
 *
 * ### Not a tool
 * No `static mcpScopes`, which is the default and the default means not exposed. An agent that wants
 * to read a file has the filesystem; this door exists for the one client that does not.
 *
 * ### `Range`, because `<video>` demands it
 * Answering the whole file to every request makes a video that cannot seek — the browser asks for a
 * byte window when the user drags the scrubber, and a server that ignores `Range` and replies `200`
 * leaves the element with nothing to seek into. `Accept-Ranges` advertises it; a satisfiable window
 * answers `206` + `Content-Range`; an unsatisfiable one answers `416` with the total size, which is
 * how a client learns what it should have asked for.
 */
@injectable()
export class GetArtifactContentController extends Controller<
	typeof GetArtifactContentControllerInputSchema,
	typeof GetArtifactContentControllerOutputSchema
> {
	readonly path = '/threads/:threadId/artifacts/:artifactId/content'
	readonly method = 'get' as const
	readonly description = 'The bytes of one recorded artifact, for the console preview'
	readonly inputSchema = GetArtifactContentControllerInputSchema
	readonly outputSchema = GetArtifactContentControllerOutputSchema
	override contentType: MimeTypes = MimeTypes['.bin']
	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly useCase: GetArtifactContent) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const file = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			artifactId: request.params.artifactId,
		})

		const headers = {
			'Content-Type': file.contentType,
			// `inline` is the difference between "the browser shows this" and "the browser downloads
			// this", and every preview in the console depends on the first.
			'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
			'Accept-Ranges': 'bytes',
		}

		// `headers` is optional on the request envelope — a caller that sends none simply asked for the
		// whole file, which is the same thing an absent `Range` means.
		const range = parseRange(request.headers?.range, file.size)
		if (range === 'unsatisfiable') {
			return this.rawResponse(
				new Response(null, {
					status: HttpStatusCode.REQUESTED_RANGE_NOT_SATISFIABLE,
					headers: { ...headers, 'Content-Range': `bytes */${file.size}` },
				}),
			)
		}

		if (range) {
			const length = range.end - range.start + 1
			return this.rawResponse(
				new Response(webStreamOf(file.path, range.start, range.end), {
					status: HttpStatusCode.PARTIAL_CONTENT,
					headers: {
						...headers,
						'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
						'Content-Length': String(length),
					},
				}),
			)
		}

		return this.rawResponse(
			new Response(webStreamOf(file.path), {
				status: HttpStatusCode.OK,
				headers: { ...headers, 'Content-Length': String(file.size) },
			}),
		)
	}
}

/**
 * The file (or a window of it) as the web stream a `Response` body wants.
 *
 * Built by hand rather than with `Readable.toWeb`, and the reason is not style: `toWeb` returns
 * `node:stream/web`'s ReadableStream, which is not the DOM one `Response` is typed against, so
 * handing it over costs a double cast through `unknown` — the escape hatch the repo's own detector
 * flags (`universal#as-unknown`) and Non-Negotiable #1 forbids. The explicit source is cast-free AND
 * strictly better behaved: `cancel` closes the file descriptor when the browser abandons a request
 * (every video seek abandons one), and `pull`/`pause` gives the read real backpressure instead of
 * buffering a whole file into memory because the socket is slower than the disk.
 */
function webStreamOf(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
	const file = start === undefined ? createReadStream(path) : createReadStream(path, { start, end })
	return new ReadableStream<Uint8Array>({
		start(controller) {
			file.on('data', chunk => {
				controller.enqueue(new Uint8Array(chunk as Buffer))
				// Stop reading once the consumer is saturated; `pull` resumes us.
				if ((controller.desiredSize ?? 1) <= 0) file.pause()
			})
			file.on('end', () => controller.close())
			file.on('error', error => controller.error(error))
		},
		pull() {
			file.resume()
		},
		cancel() {
			file.destroy()
		},
	})
}

export interface ByteRange {
	start: number
	end: number
}

/**
 * The ONE range form that matters here: `bytes=<first>-<last>`, with either end omittable.
 *
 * Returns `undefined` for "no range asked" (including a multi-range or non-`bytes` header, which
 * RFC 9110 lets a server answer with the whole representation), and `'unsatisfiable'` for a window
 * that starts past the end — the case that must NOT be silently widened to the whole file, because a
 * client asking for byte 10 of a 5-byte file has a bug the `416` tells it about.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | undefined {
	if (!header) return undefined
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
	if (!match) return undefined

	const [, rawStart, rawEnd] = match
	if (rawStart === '' && rawEnd === '') return undefined

	// `bytes=-N` — the LAST n bytes. N of 0 asks for nothing, which no window can express.
	if (rawStart === '') {
		const suffix = Number(rawEnd)
		if (suffix === 0) return 'unsatisfiable'
		return { start: Math.max(0, size - suffix), end: size - 1 }
	}

	const start = Number(rawStart)
	if (start >= size) return 'unsatisfiable'
	const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
	if (end < start) return 'unsatisfiable'
	return { start, end }
}
