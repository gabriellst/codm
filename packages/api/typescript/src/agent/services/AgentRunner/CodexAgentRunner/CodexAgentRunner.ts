import { injectable } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z, type ZodType } from 'zod'
import { LoggingService, AgentIdentityService } from '@codm/core-typescript'
import { ProductConfig } from '@shared/config/ProductConfig'
import { AgentModelId, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunOutcome, type TransportStopKind } from '../../../enums'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { ProviderBinarySpec } from '../../../types/ProviderBinarySpec'
import { CodexJsonCodec, CodexToTurnFactAccumulator, type CodexTerminalRecord } from '../../CodexJsonCodec'
import { AgentRunner } from '../AgentRunner'
import { nodeAgentProcessSpawner, type AgentProcess, type AgentProcessSpawner } from '../ClaudeAgentRunner/AgentProcess'

const AUTH_HINT = /\/login\b|not logged in|please log ?in|authentication (?:required|failed)|unauthorized/i
const POST_MORTEM_MS = 5_000

const CODEX_MODEL_ALIASES: Partial<Record<AgentModelId, string>> = {
	[AgentModelId.GPT_5_3_CODEX]: 'gpt-5.3-codex',
	[AgentModelId.GPT_5_2_CODEX]: 'gpt-5.2-codex',
	[AgentModelId.GPT_5_1_CODEX]: 'gpt-5.1-codex',
}

export interface CodexBuildArgsOptions {
	cwd: string
	extraDirs?: readonly string[]
	resumeSessionId?: string
	prompt: string
	mcp?: AgentMcpInvocation
	outputSchemaPath?: string
	model?: AgentModelId
}

export interface CodexAgentRunnerOptions {
	spawner?: AgentProcessSpawner
	inactivityMs?: number
	postMortemMs?: number
}

@injectable()
export class CodexAgentRunner extends AgentRunner {
	static readonly binary: ProviderBinarySpec = {
		bin: 'codex',
		versionArgs: ['--version'],
		helpArgs: ['exec', '--help'],
		capabilityFlags: { '--config': 'mcpConfig', 'resume': 'sessionResume' },
	}

	private spawner = nodeAgentProcessSpawner
	private inactivityMs = ProductConfig.env.CODM_AGENT_INACTIVITY_MS
	private postMortemMs = POST_MORTEM_MS
	private readonly live = new Set<AgentProcess>()

	constructor(private readonly logging: LoggingService, private readonly identities: AgentIdentityService) {
		super()
	}

	static withOptions(logging: LoggingService, identities: AgentIdentityService, options: CodexAgentRunnerOptions): CodexAgentRunner {
		const runner = new CodexAgentRunner(logging, identities)
		if (options.spawner) runner.spawner = options.spawner
		if (options.inactivityMs !== undefined) runner.inactivityMs = options.inactivityMs
		if (options.postMortemMs !== undefined) runner.postMortemMs = options.postMortemMs
		return runner
	}

	static buildArgs({ cwd, extraDirs, resumeSessionId, prompt, mcp, outputSchemaPath, model }: CodexBuildArgsOptions): string[] {
		const args = resumeSessionId ? ['exec', '--approve-for-me', 'resume', resumeSessionId] : ['exec', '-C', cwd, '--approve-for-me']
		args.push('--json')
		const modelAlias = model && model !== AgentModelId.DEFAULT ? CODEX_MODEL_ALIASES[model] : undefined
		if (modelAlias) args.push('--model', modelAlias)
		if (!resumeSessionId) for (const dir of extraDirs ?? []) args.push('--add-dir', dir)
		if (mcp?.transport === 'http' && mcp.endpoint) {
			args.push('-c', `mcp_servers.codm.url=${JSON.stringify(mcp.endpoint)}`)
			args.push('-c', 'mcp_servers.codm.bearer_token_env_var="CODM_RUN_TOKEN"')
		}
		if (outputSchemaPath) args.push('--output-schema', outputSchemaPath)
		args.push(prompt)
		return args
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		const warn = (message: string): void => this.logging.warn({ content: { message, agentName: request.agentName, bin: CodexAgentRunner.binary.bin } })
		const codec = new CodexJsonCodec({ onWarn: warn })
		const accumulator = new CodexToTurnFactAccumulator({})
		const prompt = renderPrompt(request)
		const schema = request.outputSchema ? materializeOutputSchema(request.outputSchema) : undefined
		const cmd = [request.binaryPath, ...CodexAgentRunner.buildArgs({
			cwd: request.cwd,
			extraDirs: request.extraDirs,
			resumeSessionId: request.session?.resumeId,
			prompt,
			mcp: request.mcp,
			outputSchemaPath: schema?.path,
			model: request.model,
		})]
		let proc: AgentProcess
		try {
			proc = this.spawner({
				cmd,
				cwd: request.cwd,
				stdin: false,
				...(request.mcp ? { env: { ...process.env, CODM_RUN_TOKEN: request.mcp.token } } : {}),
			})
		} catch (cause) {
			schema?.cleanup()
			yield { type: 'finished', result: failure(`${StopKind.SERVER_ERROR}: ${String(cause)}`) }
			return
		}
		this.live.add(proc)
		const stderrChunks: string[] = []
		const stderrPump = drain(proc.stderr, stderrChunks)
		let terminal: CodexTerminalRecord | undefined
		let sessionId: string | null = null
		let watchdogFired = false
		const onAbort = (): void => proc.kill()
		request.signal?.addEventListener('abort', onAbort, { once: true })

		try {
			const iterator = proc.stdout[Symbol.asyncIterator]()
			for (;;) {
				let timer: ReturnType<typeof setTimeout> | undefined
				const step = iterator.next()
				const settled = await Promise.race([
					step,
					new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), this.inactivityMs) }),
				])
				clearTimeout(timer)
				if (settled === 'timeout') {
					step.catch(() => undefined)
					watchdogFired = true
					proc.kill()
					break
				}
				if (settled.done) break
				for (const decoded of codec.push(settled.value)) {
					for (const frame of decoded.frames) {
						if (frame.kind === 'system_init') sessionId = frame.sessionId
						yield { type: 'frame', frame }
						const fact = accumulator.apply(frame)
						if (fact) yield { type: 'fact', fact }
					}
					if (decoded.terminal) terminal = decoded.terminal
				}
			}
			for (const decoded of codec.flush()) {
				for (const frame of decoded.frames) {
					yield { type: 'frame', frame }
					const fact = accumulator.apply(frame)
					if (fact) yield { type: 'fact', fact }
				}
				if (decoded.terminal) terminal = decoded.terminal
			}
			const exitCode = await settleWithin(proc.exited, this.postMortemMs, -1)
			await settleWithin(stderrPump, this.postMortemMs, undefined)
			for (const fact of accumulator.flush()) yield { type: 'fact', fact }
			yield { type: 'finished', result: buildResult(request, { terminal, sessionId, exitCode, watchdogFired, stderr: stderrChunks.join('') }) }
		} finally {
			request.signal?.removeEventListener('abort', onAbort)
			this.live.delete(proc)
			proc.kill()
			schema?.cleanup()
			if (request.mcp) this.identities.revoke(request.mcp.token)
		}
	}

	async shutdown(): Promise<void> {
		for (const proc of this.live) proc.kill()
		this.live.clear()
	}
}

function renderPrompt(request: AgentRunRequest<ZodType | undefined>): string {
	const parts = request.messages.map(message => message.content)
	if (request.systemPrompt) parts.unshift(request.systemPrompt)
	if (request.outputSchema) parts.push('Reply with exactly one JSON object matching this JSON Schema:\n' + JSON.stringify(z.toJSONSchema(request.outputSchema)))
	return parts.join('\n\n')
}

function materializeOutputSchema(schema: ZodType): { path: string; cleanup: () => void } {
	const directory = mkdtempSync(join(tmpdir(), 'codm-codex-schema-'))
	const path = join(directory, 'output-schema.json')
	writeFileSync(path, JSON.stringify(z.toJSONSchema(schema)), { encoding: 'utf8', mode: 0o600 })
	return { path, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

function buildResult(request: AgentRunRequest<ZodType | undefined>, observed: { terminal?: CodexTerminalRecord; sessionId: string | null; exitCode: number; watchdogFired: boolean; stderr: string }): AgentRunResult {
	const replyText = observed.terminal?.text ?? ''
	const sessionId = observed.terminal?.sessionId ?? observed.sessionId
	const authSignal = `${observed.stderr}\n${observed.terminal?.apiErrorStatus ?? ''}`
	if (AUTH_HINT.test(authSignal)) return stopped(replyText, sessionId, StopKind.AUTH_REQUIRED, 'provider CLI is asking for interactive login')
	if (observed.terminal?.isError) return stopped(replyText, sessionId, StopKind.SERVER_ERROR, replyText || 'provider reported a failed turn')
	if (!observed.terminal) {
		const detail = observed.watchdogFired ? 'killed by the inactivity watchdog' : `provider exited before turn.completed (code ${observed.exitCode})${observed.stderr ? `: ${observed.stderr.trim()}` : ''}`
		return stopped(replyText, sessionId, StopKind.SERVER_ERROR, detail)
	}
	if (!request.outputSchema) return { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId, failed: false }
	let candidate: unknown
	try { candidate = JSON.parse(replyText.trim()) } catch { return { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId, failed: true, failure: 'terminal reply text was not JSON' } }
	const parsed = request.outputSchema.safeParse(candidate)
	return parsed.success
		? { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId, output: parsed.data, failed: false }
		: { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId, failed: true, failure: parsed.error.message }
}

function stopped(replyText: string, sessionId: string | null, kind: TransportStopKind, detail: string): AgentRunResult {
	return { outcome: AgentRunOutcome.STOPPED, replyText, sessionId, failed: false, stop: { kind, detail } }
}

function failure(detail: string): AgentRunResult {
	return stopped('', null, StopKind.SERVER_ERROR as TransportStopKind, detail)
}

async function drain(stream: AsyncIterable<Uint8Array | string>, sink: string[]): Promise<void> {
	try { for await (const chunk of stream) sink.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)) } catch { /* diagnostics only */ }
}

async function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try { return await Promise.race([promise.catch(() => fallback), new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms) })]) }
	finally { clearTimeout(timer) }
}
