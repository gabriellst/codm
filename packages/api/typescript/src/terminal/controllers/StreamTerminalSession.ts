import { injectable } from 'tsyringe-neo'
import { Controller, MimeTypes, z, SSE_CONNECTED_FRAME, createSSEResponse, encodeSSEFrame } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { AgentStreamRegistry, TerminalSseFrameSchema, type TerminalStreamWriter } from '../services/AgentStreamRegistry'

export const StreamTerminalSessionInputSchema = z
	.object({
		params: z.object({ issueId: z.uuid() }),
		ctx: z.object({ ownerId: z.uuid() }),
	})
	.example([{ params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddae' }, ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])

/**
 * The SSE frame union the browser terminal panel (T12) consumes (`data: <json>\n\n`) — the
 * MATERIALIZED TerminalSseFrame union declared at its synthesizer (AgentStreamRegistry), never
 * z.unknown(): the SDK derives full narrowing for both frame kinds.
 */
export const StreamTerminalSessionOutputSchema = TerminalSseFrameSchema

/**
 * The two-stream TRANSPORT endpoint — the CodeDM descendant of whatscode's SSE Completion controller,
 * rekeyed chatId → issueId. It registers ONE observer writer per issue in `AgentStreamRegistry`
 * (double-open → 409, the observer half of the single-active invariant) and forwards every terminal
 * output frame the running session pushes (`AgentStreamRegistry.send`) straight to the browser.
 *
 * It is a pure OBSERVER: it does NOT spawn the session (the run is driven by `RunTerminalSession`,
 * invoked by the domain flow) and it carries no domain facts — those ride the outbox separately.
 * The stream stays open as a live tail until the client disconnects; `createSSEResponse` wires abort
 * → close → teardown, and the returned unregister frees the observer slot.
 */
@injectable()
export class StreamTerminalSessionController extends Controller<
	typeof StreamTerminalSessionInputSchema,
	typeof StreamTerminalSessionOutputSchema
> {
	readonly path = '/terminal/sessions/:issueId/stream'
	readonly method = 'get' as const
	readonly description = 'Live terminal output for an issue session via Server-Sent Events (browser.terminal_output_appended)'
	readonly inputSchema = StreamTerminalSessionInputSchema
	readonly outputSchema = StreamTerminalSessionOutputSchema
	override contentType: MimeTypes = MimeTypes['.stream']

	override middlewares = [OperatorMiddleware]

	constructor(private readonly registry: AgentStreamRegistry) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { issueId } = request.params
		const { ownerId } = request.ctx

		// Observer half of the single-active invariant — only one browser tails a given issue.
		if (this.registry.has(issueId)) {
			return this.rawResponse(new Response('issue already streaming', { status: 409 }))
		}

		return this.rawResponse(
			createSSEResponse({
				signal: request.raw.signal,
				headers: { 'X-Accel-Buffering': 'no' },
				onStart: handle => {
					// Frames already carry their browser-facing `name` discriminator
					// (output_appended | action_detected — the latter per the wave-0 amendment).
					const writer: TerminalStreamWriter = frame => handle.send(encodeSSEFrame(frame))
					let unregister: () => void
					try {
						unregister = this.registry.register(issueId, ownerId, writer)
					} catch (err) {
						handle.error(err)
						return undefined
					}
					handle.send(SSE_CONNECTED_FRAME)
					return unregister
				},
			}),
		)
	}
}
